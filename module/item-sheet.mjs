import { canonicalName } from './ru/naming.mjs';
import { canUsePower, preparePower, powerUsesRoll, powerRequiresTarget } from './ru/powers.mjs';
import { powerAuditData } from './ru/power-report.mjs';
import { rollFixedPool } from './dice.mjs';
import { disciplineLevel } from './discipline-effects.mjs';
import { VTM } from './config.mjs';
import { applyHealthDamage } from './combat.mjs';
import { DISCIPLINES } from './compendiums.mjs';
import { disciplineGuide } from './ru/discipline-guides.mjs';
import { pickSceneTarget, applyTargetEffect, chooseHealing, TARGET_STATUSES } from './target-actions.mjs';

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ItemSheetV2 } = foundry.applications.sheets;

export function parseCost(str) {
  if (!str) return null;
  let blood = 0, wp = 0, variable = false;
  const bm = str.match(/(\d+)(\+)?\s*(?:blood|кров[а-яё]*)/i);
  if (bm) { blood = parseInt(bm[1]); variable = !!bm[2]; }
  const wm = str.match(/(\d+)\s*(?:willpower|wp|сила\s*воли|силы\s*воли|св)/i);
  if (wm) wp = parseInt(wm[1]);
  return (blood || wp) ? { blood, wp, variable } : null;
}

async function confirmAndSpend(actor, costStr, powerName) {
  const cost = parseCost(costStr);
  if (!cost) return true;

  const blood = actor.system.blood;
  const wpVal = actor.system.willpower?.value ?? 0;

  if (cost.blood > 0 && (!blood || blood.value < cost.blood)) {
    ui.notifications.warn('Not enough blood.');
    return false;
  }
  if (cost.wp > 0 && wpVal < cost.wp) {
    ui.notifications.warn('Not enough Willpower.');
    return false;
  }

  let content;
  if (cost.variable) {
    content = `<div style="text-align:center;margin:8px 0">
      <label>Blood to spend for <b>${powerName}</b>:</label><br/>
      <input type="number" class="var-blood" value="${cost.blood}" min="${cost.blood}" max="${blood.value}"
        style="width:60px;text-align:center;margin-top:6px"/>
      ${cost.wp ? `<br/><small>Also costs ${cost.wp} Willpower</small>` : ''}
    </div>`;
  } else {
    const parts = [];
    if (cost.blood) parts.push(`${cost.blood} blood`);
    if (cost.wp) parts.push(`${cost.wp} Willpower`);
    content = `<p style="text-align:center;margin:10px 0">Spend <b>${parts.join(' and ')}</b> to use <b>${powerName}</b>?</p>`;
  }

  const result = await new Promise(resolve => {
    new Dialog({
      title: powerName,
      content,
      buttons: {
        yes: {
          icon: '<i class="fas fa-check"></i>', label: 'Spend',
          callback: dlg => {
            if (cost.variable) {
              const val = parseInt(dlg[0].querySelector('.var-blood').value);
              resolve(Math.max(val || cost.blood, cost.blood));
            } else resolve(true);
          }
        },
        no: { icon: '<i class="fas fa-times"></i>', label: 'Cancel', callback: () => resolve(false) },
      },
      default: 'yes',
      close: () => resolve(false),
    }, { classes: ['vtm-v20', 'dialog'], width: 320 }).render(true);
  });

  if (result === false) return false;

  const bloodSpend = typeof result === 'number' ? result : cost.blood;
  if (bloodSpend > (blood?.value || 0)) {
    ui.notifications.warn('Not enough blood.');
    return false;
  }

  const updates = {};
  if (bloodSpend > 0) updates['system.blood.value'] = blood.value - bloodSpend;
  if (cost.wp > 0) updates['system.willpower.value'] = wpVal - cost.wp;
  if (Object.keys(updates).length) await actor.update(updates);

  if (bloodSpend > 0) {
    if (actor.sheet?.rendered && actor.sheet._playHealAnimation) {
      actor.sheet._playHealAnimation();
    } else {
      foundry.audio.AudioHelper.play({
        src: 'systems/vtm-v20/VTM icons/Blood Consumption Sound effect.mp3', volume: 0.6, loop: false
      }, false);
    }
  }

  return true;
}

async function whisperActivation(actor, powerName, detail, costStr, showActivated = true) {
  const pFlags = actor.getFlag('vtm-v20', 'portrait') || {};
  let portraitStyle = '';
  if ((pFlags.scale ?? 1) > 1 || pFlags.offX || pFlags.offY) {
    const r = 0.213 / (pFlags.scale ?? 1);
    portraitStyle = `object-position: calc(50% + ${(pFlags.offX * r).toFixed(1)}px) calc(50% + ${(pFlags.offY * r).toFixed(1)}px); transform: scale(${pFlags.scale});`;
  }
  let costLine = '';
  const cost = parseCost(costStr);
  if (cost) {
    const parts = [];
    if (cost.blood) parts.push(`${cost.blood} blood spent (${actor.system.blood?.value ?? 0} remaining)`);
    if (cost.wp) parts.push(`${cost.wp} Willpower spent (${actor.system.willpower?.value ?? 0} remaining)`);
    costLine = parts.join(', ');
  }
  const html = `<div class="vtm-roll">
    <div class="roll-header">
      <div class="roll-portrait-wrap">
        <img class="roll-portrait" src="${actor.img}" style="${portraitStyle}" />
      </div>
      <div class="roll-info">
        <span class="roll-actor">${actor.name}</span>
        <span class="roll-label">${powerName}</span>
      </div>
    </div>
    ${showActivated ? '<div class="roll-result"><span class="result-success">Activated</span></div>' : ''}
    ${costLine ? `<div class="roll-meta">${costLine}</div>` : ''}
    ${detail ? `<div class="roll-extra">${detail}</div>` : ''}
  </div>`;
  const gmIds = game.users.filter(u => u.isGM).map(u => u.id);
  const whisperIds = [...new Set([game.user.id, ...gmIds])];
  await ChatMessage.create({
    user: game.user.id,
    speaker: ChatMessage.getSpeaker({ actor }),
    content: html,
    whisper: whisperIds,
  });
}

async function applyConfiguredPower(actor, item, power, picked, roll = null) {
  const kind = power.effectKind || 'none';
  if (kind === 'none' || !['heal','damage','status'].includes(kind)) return;
  // An empty target choice means 'use on self', including when no self-token
  // is currently on the canvas.
  const target = picked?.actor || actor;
  if (roll && roll.total <= 0) return;
  const amount = Math.min(20, Math.max(0, (Number(power.effectAmount) || 1) * (power.effectPerSuccess && roll ? roll.total : 1)));
  try {
    const applied = await applyTargetEffect({ source: actor, item, token: picked?.token || null, actor: target,
      kind, amount, damageType: power.effectDamageType || 'normal', statusId: power.effectStatus || 'vtm-dazed' });
    const action = kind === 'heal' ? 'исцелено' : kind === 'damage' ? 'нанесено повреждений' : 'наложено состояние';
    ui.notifications.info(`${target.name}: ${action}${kind === 'status' ? '' : ' ' + applied.applied}.`);
  } catch (error) { ui.notifications.error(error.message || 'Не удалось применить эффект.'); }
}

// Shared entry point: the individual power button in the actor sheet and
// the dice button in the item sheet must use exactly the same V20 procedure.
export async function rollDisciplinePower(actor,item,key) {
  if(!canUsePower(actor,item,key)){
    ui.notifications.warn('Эта способность ещё не изучена.');return null;
  }
  if(!powerUsesRoll(item,key)){
    ui.notifications.info('Для этой силы обычный бросок активации не предусмотрен.');return null;
  }
  const needed=powerRequiresTarget(item,key);
  const picked=await pickSceneTarget({title:`Цель силы: ${item.name}`,allowNone:!needed});
  if(picked.cancelled)return null;
  const prepared=preparePower(actor,item,key,picked.actor);
  if(prepared.error){ui.notifications.warn(prepared.error);return null;}
  const power=prepared.power;
  const meta={target:picked.actor?.name||'Без цели',basis:prepared.audit.difficultyBasis,
    note:prepared.audit.note||''};
  const roll=await game.vtm.rollDicePool(actor,{
    trait:power.primary,trait2:power.secondary,
    label:`${item.name}: ${power.name||'Уровень '+key.slice(3)}${picked.actor?' → '+picked.actor.name:''}`,
    difficulty:power.difficulty,
    powerMeta:meta,
    beforeRoll:power.cost?()=>confirmAndSpend(actor,power.cost,power.name||item.name):null,
  });
  if(!roll)return null;
  let resistance=null,resistancePending=false;
  if(prepared.audit.resistance && roll.total>0 && picked.actor){
    const def=prepared.audit.resistance;
    if(game.user.isGM || picked.actor.isOwner){
      const fort=def.includeFortitude?disciplineLevel(picked.actor,'Fortitude'):0;
      const pool=Math.max(1,Number(picked.actor.system.attributes?.stamina||0)+(def.includeFortitude?fort:0));
      // No extra roll for unsupported models; the V20 contested check is
      // explicit and auditable with the same dice engine.
      const base=def.primary==='willpower'?Math.max(1,Number(picked.actor.system.willpower?.max||0)):pool;
      resistance=await rollFixedPool(picked.actor,{
        pool:base,difficulty:def.difficulty,
        label:`Сопротивление: ${picked.actor.name} → ${power.name||item.name} (${def.basis})`,
      });
    }else resistancePending=true;
  }
  const audit=powerAuditData({actorName:actor.name,targetName:picked.actor?.name,discipline:item.name,
    power:power.name,prepared,attack:roll,defense:resistance,resistancePending});
  const esc=foundry.utils.escapeHTML;
  const metrics=audit.metrics;
  const r=audit.defense;
  const adjustedDifficulty=roll.difficulty!==prepared.power.difficulty;
  const html=`<div class="vtm-roll vtm-power-resolution">
    <div class="roll-header"><b>${esc(item.name)}: ${esc(power.name||'')}</b></div>
    <div class="roll-meta">${esc(actor.name)} → ${esc(audit.targetName)}</div>
    <div class="vtm-compact-dice" aria-label="Кубы броска">Кубы: ${esc(metrics.values.join(', ')||'без броска')} · сложность ${audit.difficulty}</div>
    <div class="roll-result"><b>${esc(audit.result)}</b> · ${audit.net} чистых успехов</div>
    ${audit.resistancePending?'<div class="vtm-power-warning">Сопротивление цели ожидается. Автоэффект не применён.</div>':''}
    <details class="vtm-power-audit vtm-foldable" aria-label="Подробная проверка дисциплины">
      <summary class="vtm-report-title"><span>Подробности расчёта</span><i class="fas fa-chevron-down vtm-fold-chevron" aria-hidden="true"></i></summary>
      <div class="vtm-report-body">
        <div>Основание сложности: ${esc(audit.basis)}${adjustedDifficulty?' · сложность вручную изменена в диалоге':''}</div>
        <div>Успехи на кубах: ${metrics.successfulDice+metrics.extraSpecialization}; единицы: ${metrics.ones}; автоматические: ${metrics.auto}; <b>итого: ${metrics.net}</b></div>
        ${audit.resistance?`<div>Сопротивление: ${esc(audit.resistance.basis)} (сл. ${audit.resistance.difficulty})</div>`:''}
        ${r?`<div>Кубы защиты: ${esc(r.values.join(', '))}; успехи: ${r.net}; итоговые чистые успехи: <b>${audit.net}</b></div>`:''}
        ${audit.resistancePending?'<div>Сопротивление требуется выполнить владельцу цели или ведущему. Автоэффект не применён до разрешения проверки.</div>':''}
        ${audit.threshold!==null?`<div>Нужно накопить успехов: ${audit.threshold}</div>`:''}
        ${power.cost?`<div>Стоимость: ${esc(power.cost)} (подтверждена перед броском)</div>`:''}
        ${audit.note?`<div>${esc(audit.note)}</div>`:''}
      </div>
    </details>
  </div>`;
  await ChatMessage.create({user:game.user.id,speaker:ChatMessage.getSpeaker({actor}),content:html,
    style:CONST.CHAT_MESSAGE_STYLES.OTHER});
  if(roll.total>0 && (!prepared.audit.resistance || (!resistancePending && audit.net>0))){
    const effectiveRoll=prepared.audit.resistance?{...roll,total:audit.net}:roll;
    await applyConfiguredPower(actor,item,power,picked,effectiveRoll);
  }
  return {roll,audit};
}

export class VtmItemSheet extends HandlebarsApplicationMixin(ItemSheetV2) {

  static DEFAULT_OPTIONS = {
    tag: "form",
    classes: ["vtm-v20", "sheet", "item"],
    position: { width: 550, height: 620 },
    window: { resizable: true },
    form: { submitOnChange: true },
    actions: {}
  };

  static PARTS = {
    sheet: { template: "systems/vtm-v20/templates/item-sheet.hbs" }
  };

  // Item types with dense sheet content get room to breathe.
  _onFirstRender(context, options) {
    super._onFirstRender(context, options);
    if (this.document.type === 'discipline' || this.document.type === 'background' || this.document.type === 'path') {
      this.setPosition({ width: 580, height: 660 });
    } else if (this.document.type === 'weapon') {
      this.setPosition({ width: 560, height: 650 });
    }
  }


  // -- Context --------------------------------------------------------------

  async _prepareContext(options) {
    const ctx = await super._prepareContext(options);
    const item = this.document;
    ctx.item = item;
    ctx.system = item.system;
    ctx.config = CONFIG.VTM;
    ctx.isGM = game.user.isGM;
    ctx.isEditable = this.isEditable;
    ctx.typeLabel = game.i18n.localize(`TYPES.Item.${item.type}`);
    ctx.hasEI = game.modules.get('enhanced-inventory')?.active ?? false;

    if (item.type === 'background') {
      const maxVisible = (item.parent && ctx.system.rating > 0)
        ? ctx.system.rating : 5;
      ctx.bgLevels = await Promise.all([1, 2, 3, 4, 5].filter(n => n <= maxVisible && !!ctx.system.powers?.[`lvl${n}`]).map(async n => {
        const key = `lvl${n}`;
        const lvl = ctx.system.levels[key];
        return {
          num: n,
          key,
          name: lvl.name,
          desc: lvl.desc,
          enrichedDesc: await TextEditor.enrichHTML(lvl.desc || '', { relativeTo: item }),
        };
      }));
    }

    ctx.isAuspex = item.type === 'discipline'
      && canonicalName(item.name).toLowerCase() === 'auspex';

    if (item.type === 'discipline' || item.type === 'path') {
      const loc = k => game.i18n.localize(`VTM.${k.charAt(0).toUpperCase() + k.slice(1)}`);
      const traitOpts = [
        ...Object.values(VTM.attributes).flat().map(k => ({ key: `attributes.${k}`, label: loc(k) })),
        ...Object.values(VTM.abilities).flat().map(k => ({ key: `abilities.${k}`, label: loc(k) })),
        { key: 'virtues.conscience', label: 'Conscience' },
        { key: 'virtues.selfControl', label: 'Self-Control' },
        { key: 'virtues.courage', label: 'Courage' },
        { key: 'willpower', label: 'Willpower' },
        { key: 'humanity', label: 'Humanity' },
      ];

      const maxVisible = item.parent
        ? Math.min(5, Math.max(0, Number(ctx.system.level) || 0)) : 5;
      ctx.noLearnedPowers = !!item.parent && maxVisible === 0;
      const disc = canonicalName(item.name).toLowerCase();

      ctx.powerLevels = await Promise.all([1, 2, 3, 4, 5].filter(n => n <= maxVisible && !!ctx.system.powers?.[`lvl${n}`]).map(async n => {
        const key = `lvl${n}`;
        const power = ctx.system.powers?.[key];
        if (!power) return null;
        const needsActivate = (disc === 'vicissitude' && key === 'lvl3');
        return {
          num: n, key,
          name: power.name, desc: power.desc,
          guide: item.type === 'discipline' && !(power.desc||'').includes(disciplineGuide(canonicalName(item.name),n)) ? disciplineGuide(canonicalName(item.name),n) : '',
          enrichedDesc: await TextEditor.enrichHTML(power.desc || '', { relativeTo: item }),
          difficulty: power.difficulty, cost: power.cost,
          effectKind: power.effectKind || 'none', effectAmount: power.effectAmount || 1,
          effectDamageType: power.effectDamageType || 'normal', effectStatus: power.effectStatus || 'vtm-dazed',
          effectPerSuccess: !!power.effectPerSuccess,
          statusOptions: TARGET_STATUSES.map(o => ({ ...o, selected: o.id === (power.effectStatus || 'vtm-dazed') })),
          primary: power.primary, secondary: power.secondary,
          hasRoll: powerUsesRoll(item,key),
          hasActivate: (!powerUsesRoll(item,key) && (!!power.cost || (power.effectKind && power.effectKind !== 'none') || (disc === 'obeah' && key === 'lvl3'))) || needsActivate,
          primaryOptions: traitOpts.map(o => ({ ...o, selected: o.key === power.primary })),
          secondaryOptions: traitOpts.map(o => ({ ...o, selected: o.key === power.secondary })),
        };
      }));
    }

    if (item.type === 'ritual') {
      const loc = k => game.i18n.localize(`VTM.${k.charAt(0).toUpperCase() + k.slice(1)}`);
      const traitOpts = [
        ...Object.values(VTM.attributes).flat().map(k => ({ key: `attributes.${k}`, label: loc(k) })),
        ...Object.values(VTM.abilities).flat().map(k => ({ key: `abilities.${k}`, label: loc(k) })),
      ];
      ctx.ritualPrimaryOptions = traitOpts.map(o => ({ ...o, selected: o.key === ctx.system.primary }));
      ctx.ritualSecondaryOptions = traitOpts.map(o => ({ ...o, selected: o.key === ctx.system.secondary }));
      ctx.ritualCastDiff = ctx.system.castDifficulty;
    }

    if (item.type === 'weapon') {
      const loc = k => game.i18n.localize(`VTM.${k.charAt(0).toUpperCase() + k.slice(1)}`);
      ctx.requireTraitOptions = [
        { key: '', label: 'None', selected: !item.system.requireTrait },
        ...Object.values(VTM.attributes).flat().map(k => ({
          key: `attributes.${k}`, label: loc(k),
          selected: item.system.requireTrait === `attributes.${k}`,
        })),
        ...Object.values(VTM.abilities).flat().map(k => ({
          key: `abilities.${k}`, label: loc(k),
          selected: item.system.requireTrait === `abilities.${k}`,
        })),
      ];
    }

    // Dice bonus editor: gear plus merits/flaws can grant flat dice to traits
    if (['weapon', 'armor', 'equipment', 'container', 'merit'].includes(item.type)) {
      const loc = k => game.i18n.localize(`VTM.${k.charAt(0).toUpperCase() + k.slice(1)}`);
      const attrOpts = Object.values(VTM.attributes).flat().map(k => ({ key: `attributes.${k}`, label: loc(k) }));
      const abilOpts = Object.values(VTM.abilities).flat().map(k => ({ key: `abilities.${k}`, label: loc(k) }));
      ctx.bonusCapable = true;
      ctx.bonusRows = (item.system.bonuses || []).map((b, index) => ({
        index,
        value: b.value,
        attrOpts: attrOpts.map(o => ({ ...o, selected: o.key === b.trait })),
        abilOpts: abilOpts.map(o => ({ ...o, selected: o.key === b.trait })),
      }));
    }

    if (item.type === 'clan') {
      const chosen = new Set(ctx.system.disciplines || []);
      const names = DISCIPLINES.map(d => d.name);
      // World discipline items (homebrew) count too
      for (const i of game.items) {
        if (i.type === 'discipline' && !names.includes(canonicalName(i.name))) names.push(canonicalName(i.name));
      }
      for (const n of chosen) if (!names.includes(n)) names.push(n);
      ctx.clanDisciplineOptions = names.map(n => ({ name: n, checked: chosen.has(n) }));
    }

    ctx.enrichedDescription = await TextEditor.enrichHTML(item.system.description || '', { relativeTo: item });
    // Dot cap follows the owner's generation; unowned items show the mortal cap
    ctx.traitMax = item.parent?.system?.traitMax || 5;
    return ctx;
  }


  // -- Render & listeners ---------------------------------------------------

  _onRender(context, options) {
    super._onRender(context, options);
    const el = this.element;

    el.querySelectorAll('.clan-disc-check').forEach(cb =>
      cb.addEventListener('change', () => {
        const names = [...el.querySelectorAll('.clan-disc-check:checked')].map(c => c.dataset.name);
        this.document.update({ 'system.disciplines': names });
      }));

    // Dice bonus rows live outside the form so they commit as one array
    el.querySelector('.bonus-add')?.addEventListener('click', () => {
      const list = (this.document.system.bonuses || []).map(b => ({ trait: b.trait, value: b.value }));
      list.push({ trait: 'abilities.alertness', value: 1 });
      this.document.update({ 'system.bonuses': list });
    });
    el.querySelectorAll('.bonus-remove').forEach(btn =>
      btn.addEventListener('click', () => {
        const i = parseInt(btn.dataset.index);
        const list = (this.document.system.bonuses || []).map(b => ({ trait: b.trait, value: b.value }));
        if (!isNaN(i)) list.splice(i, 1);
        this.document.update({ 'system.bonuses': list });
      }));
    const commitBonuses = () => {
      const list = [...el.querySelectorAll('.bonus-row')].map(r => ({
        trait: r.querySelector('.bonus-trait').value,
        value: parseInt(r.querySelector('.bonus-value').value) || 0,
      }));
      this.document.update({ 'system.bonuses': list });
    };
    el.querySelectorAll('.bonus-trait, .bonus-value').forEach(input =>
      input.addEventListener('change', commitBonuses));

    // Image: click for lightbox, edit button for file picker
    const img = el.querySelector('.sheet-header img');
    if (img) {
      img.addEventListener('click', ev => {
        ev.preventDefault();
        this._openLightbox(this.document.img);
      });
    }
    el.querySelector('.item-img-show')?.addEventListener('click', ev => {
      ev.stopPropagation();
      const src = this.document.img;
      const name = this.document.name;
      game.vtm.openLightbox(src, name);
      game.socket.emit('system.vtm-v20', { action: 'showPortrait', src, name });
    });
    el.querySelector('.item-img-edit')?.addEventListener('click', ev => {
      ev.stopPropagation();
      new FilePicker({
        type: 'image',
        current: this.document.img,
        callback: path => this.document.update({ img: path })
      }).browse();
    });

    if (!this.isEditable) return;

    // Dot ratings
    el.querySelectorAll('.dot').forEach(dot => {
      dot.addEventListener('click', () => {
        const val = parseInt(dot.dataset.value);
        const path = dot.closest('.dot-row').dataset.path;
        const cur = foundry.utils.getProperty(this.document, path);
        this.document.update({ [path]: val === cur ? val - 1 : val });
      });
    });

    el.querySelector('.aura-chart-btn')?.addEventListener('click', () => this._showAuraChart());

    // Typing the automatic value (or clearing) hands difficulty back to 3 + level
    el.querySelector('.ritual-diff')?.addEventListener('change', ev => {
      const sys = this.document.system;
      const auto = Math.min(3 + (sys.level || 1), 9);
      const v = parseInt(ev.currentTarget.value, 10);
      this.document.update({ 'system.difficulty': (!v || v === auto) ? 0 : Math.min(Math.max(v, 2), 10) });
    });

    el.querySelector('.ritual-roll')?.addEventListener('click', () => {
      const actor = this.document.parent;
      if (!actor) {
        ui.notifications.warn('This ritual must be on a character to roll.');
        return;
      }
      const sys = this.document.system;
      game.vtm.rollDicePool(actor, {
        trait: sys.primary,
        trait2: sys.secondary,
        label: `Ritual: ${this.document.name}`,
        difficulty: sys.castDifficulty,
      });
    });

    el.querySelectorAll('.power-roll').forEach(btn => {
      btn.addEventListener('click', async () => {
        const key = btn.dataset.level;
        const actor = this.document.parent;
        if (!actor) { ui.notifications.warn('Предмет должен находиться на листе персонажа.'); return; }
        if (!canUsePower(actor, this.document, key)) {
          ui.notifications.warn('Эта способность ещё не изучена.'); return;
        }
        await rollDisciplinePower(actor,this.document,key);
      });
    });

    el.querySelectorAll('.power-activate').forEach(btn => {
      btn.addEventListener('click', async () => {
        const key = btn.dataset.level;
        const actor = this.document.parent;
        if (!canUsePower(actor, this.document, key)) {
          ui.notifications.warn('Эта способность ещё не изучена.'); return;
        }
        const power = this.document.system.powers[key];
        if (!actor) {
          ui.notifications.warn('This item must be on a character to activate.');
          return;
        }

        const disc = canonicalName(this.document.name).toLowerCase();
        const pName = power.name || this.document.name;
        // V20 Salubri: Corpore Sano has a variable blood cost and can heal anyone.
        if (disc === 'obeah' && key === 'lvl3') {
          const picked = await pickSceneTarget({ title: 'Обеа III: Здоровье тела' });
          if (picked.cancelled) return;
          const healing = await chooseHealing(actor, picked.actor, { title: 'Обеа: лечение раны' });
          if (!healing) return;
          if (!game.user.isGM && !picked.actor.isOwner && !game.users.some(u => u.active && u.isGM)) {
            ui.notifications.warn('Лечение другого игрока требует подключённого ведущего.'); return;
          }
          const cur = actor.system.blood?.value || 0;
          if (cur < healing.cost) return ui.notifications.warn('Недостаточно крови.');
          // Actual deduction and the healed wound are distinct actor updates.
          await actor.update({ 'system.blood.value': cur - healing.cost });
          try {
            const result = await applyTargetEffect({ source: actor, item: this.document, token: picked.token,
              kind: 'heal', amount: healing.amount, damageType: healing.type });
            await whisperActivation(actor, `Обеа III: Здоровье тела → ${picked.actor.name}`, `Исцелено: ${result.applied} ур. Цена: ${healing.cost} крови.`, `${healing.cost} blood`);
          } catch (error) { ui.notifications.error(error.message || 'Не удалось исцелить цель.'); }
          return;
        }
        if (power.effectKind && power.effectKind !== 'none' && !power.primary) {
          const picked = await pickSceneTarget({ title: `Цель способности: ${pName}` });
          if (picked.cancelled) return;
          const ok = await confirmAndSpend(actor, power.cost, pName);
          if (!ok) return;
          await applyConfiguredPower(actor, this.document, power, picked);
          await whisperActivation(actor, `${pName} → ${picked.actor?.name || actor.name}`, null, power.cost);
          return;
        }
        const powerKey = `${disc}:${key}`;
        const markActive = async (d) => {
          const list = actor.getFlag('vtm-v20', 'activeDisciplines') || [];
          if (!list.includes(d)) await actor.setFlag('vtm-v20', 'activeDisciplines', [...list, d]);
        };

        // Shape of the Beast: wolf/bat choice
        if (disc === 'protean' && key === 'lvl4') {
          if (actor.getFlag('vtm-v20', 'wolfForm') || actor.getFlag('vtm-v20', 'batForm')) {
            ui.notifications.warn('Shape of the Beast already active.');
            return;
          }
          const form = await new Promise(resolve => {
            new Dialog({
              title: pName,
              content: '<p style="text-align:center;margin:10px 0">Choose your form:</p>',
              buttons: {
                wolf: { icon: '<i class="fas fa-paw"></i>', label: 'Wolf', callback: () => resolve('wolf') },
                bat: { icon: '<i class="fas fa-crow"></i>', label: 'Bat', callback: () => resolve('bat') },
              },
              close: () => resolve(null),
            }, { classes: ['vtm-v20', 'dialog'], width: 300 }).render(true);
          });
          if (!form) return;
          const ok = await confirmAndSpend(actor, power.cost, pName);
          if (!ok) return;
          if (form === 'wolf') {
            await actor.createEmbeddedDocuments('Item', [{
              name: 'Wolf Bite', type: 'weapon', img: this.document.img,
              system: { damage: 'Str+1', damageType: 'aggravated', equipped: true },
            }]);
            await actor.setFlag('vtm-v20', 'wolfForm', true);
          } else {
            await actor.setFlag('vtm-v20', 'batForm', { strength: actor.system.attributes.strength });
            await actor.update({ 'system.attributes.strength': 1 });
          }
          await markActive('protean');
          await whisperActivation(actor, `${pName} (${form})`, form === 'wolf' ? 'Wolf Bite added, speed doubled, Perception -2 diff.' : 'Strength set to 1, Perception -3 diff.', power.cost);
          return;
        }

        // Skin of the Adder
        if (disc === 'serpentis' && key === 'lvl3') {
          if (actor.getFlag('vtm-v20', 'skinOfTheAdder')) {
            ui.notifications.warn('Skin of the Adder already active.');
            return;
          }
          const ok = await confirmAndSpend(actor, power.cost, pName);
          if (!ok) return;
          const origApp = actor.system.attributes.appearance;
          await actor.setFlag('vtm-v20', 'skinOfTheAdder', { appearance: origApp });
          await actor.update({ 'system.attributes.appearance': 1 });
          await markActive('serpentis');
          await whisperActivation(actor, pName, 'Soak difficulty 5, bite +1 damage, Appearance set to 1.', power.cost);
          return;
        }

        // Horrid Reality
        if (disc === 'chimerstry' && key === 'lvl5') {
          if (actor.getFlag('vtm-v20', 'horridReality')) {
            ui.notifications.warn('Horrid Reality already active.');
            return;
          }
          const ok = await confirmAndSpend(actor, power.cost, pName);
          if (!ok) return;
          await actor.setFlag('vtm-v20', 'horridReality', true);
          await markActive('chimerstry');
          await whisperActivation(actor, pName, 'Horrid Reality Injury attack available.', power.cost);
          return;
        }

        // Shadow Play
        if (disc === 'obtenebration' && key === 'lvl1') {
          if (actor.getFlag('vtm-v20', 'shadowPlay')) {
            ui.notifications.warn('Shadow Play already active.');
            return;
          }
          const ok = await confirmAndSpend(actor, power.cost, pName);
          if (!ok) return;
          await actor.setFlag('vtm-v20', 'shadowPlay', true);
          await markActive('obtenebration');
          await whisperActivation(actor, pName, '+1 ranged difficulty against you, +1 Stealth/Intimidation.', power.cost);
          return;
        }

        // Bonecraft modes
        if (disc === 'vicissitude' && key === 'lvl3') {
          const hasSpikes = actor.items.find(i => i.type === 'weapon' && canonicalName(i.name) === 'Bone Spikes');
          const hasQuills = actor.getFlag('vtm-v20', 'boneQuills');
          if (hasSpikes || hasQuills) {
            ui.notifications.warn('Bonecraft already active.');
            return;
          }

          const mode = await new Promise(resolve => {
            new Dialog({
              title: 'Bonecraft',
              content: '<p style="margin:8px 0;color:#ddd;">Choose Bonecraft mode:</p>',
              buttons: {
                spikes: { label: 'Knuckle Spikes', callback: () => resolve('spikes') },
                quills: { label: 'Defensive Quills', callback: () => resolve('quills') },
                rip: { label: 'Offensive Bone Rip', callback: () => resolve('rip') },
              },
              close: () => resolve(null),
            }, { classes: ['vtm-v20', 'dialog'], width: 360 }).render(true);
          });
          if (!mode) return;

          const ok = await confirmAndSpend(actor, power.cost, pName);
          if (!ok) return;

          if (mode === 'spikes') {
            await applyHealthDamage(actor, 1, 'lethal');
            await actor.createEmbeddedDocuments('Item', [{
              name: 'Bone Spikes', type: 'weapon', img: this.document.img,
              system: { damage: 'Str+1', damageType: 'lethal', equipped: true },
            }]);
            await markActive(disc);
            await whisperActivation(actor, 'Bonecraft: Knuckle Spikes', 'Str+1 lethal. 1 lethal to self from bone piercing skin.', power.cost);
          } else if (mode === 'quills') {
            const result = await game.vtm.rollDicePool(actor, {
              trait: 'attributes.strength', trait2: 'abilities.medicine',
              label: `${pName}: Defensive Quills`, difficulty: 7,
            });
            if (!result) return;

            if (result.outcome === 'botch') {
              await whisperActivation(actor, 'Bonecraft: Defensive Quills', 'BOTCH: Sent to torpor!', power.cost);
              return;
            }

            const selfDmg = Math.max(5 - result.total, 0);
            if (selfDmg > 0) await applyHealthDamage(actor, selfDmg, 'lethal');
            await actor.setFlag('vtm-v20', 'boneQuills', true);
            await markActive(disc);
            const detail = selfDmg > 0
              ? `${selfDmg} lethal to self. Melee attackers take their Str in lethal (unless 3+ hit successes). +2 grapple damage.`
              : 'No self-damage. Melee attackers take their Str in lethal (unless 3+ hit successes). +2 grapple damage.';
            await whisperActivation(actor, 'Bonecraft: Defensive Quills', detail, power.cost);
          } else {
            const result = await game.vtm.rollDicePool(actor, {
              trait: 'attributes.strength', trait2: 'abilities.medicine',
              label: `${pName}: Offensive Bone Rip`, difficulty: 7,
            });
            if (!result) return;

            if (result.outcome === 'botch') {
              await whisperActivation(actor, 'Bonecraft: Offensive Bone Rip', 'BOTCH: The attempt fails.', power.cost);
              return;
            }
            const dmg = result.total;
            let detail = dmg > 0 ? `${dmg} lethal damage to target.` : 'No damage.';
            if (dmg >= 5) detail += ' 5+ successes: can collapse rib cage (target vampire loses half blood).';
            await whisperActivation(actor, 'Bonecraft: Offensive Bone Rip', detail, power.cost);
          }
          return;
        }

        // Weapon-creating powers
        const weaponTable = {
          'protean:lvl2': { name: 'Feral Claws', damage: 'Str+1', damageType: 'aggravated', img: 'systems/vtm-v20/VTM icons/claw-slashes.svg' },
        };
        const weap = weaponTable[powerKey];
        if (weap && actor.items.find(i => i.type === 'weapon' && canonicalName(i.name) === canonicalName(weap.name))) {
          ui.notifications.warn(`${weap.name} already active.`);
          return;
        }

        // Horrid Form
        const isHorridForm = disc === 'vicissitude' && key === 'lvl4';
        if (isHorridForm && actor.getFlag('vtm-v20', 'horridForm')) {
          ui.notifications.warn('Horrid Form is already active.');
          return;
        }

        const ok = await confirmAndSpend(actor, power.cost, pName);
        if (!ok) return;

        if (weap) {
          await actor.createEmbeddedDocuments('Item', [{
            name: weap.name, type: 'weapon', img: weap.img || this.document.img,
            system: { damage: weap.damage, damageType: weap.damageType, equipped: true },
          }]);
          await markActive(disc);
          await whisperActivation(actor, weap.name, `${weap.damage} ${weap.damageType} damage.`, power.cost);
          return;
        }

        if (isHorridForm) {
          const a = actor.system.attributes;
          await actor.setFlag('vtm-v20', 'horridForm', {
            strength: a.strength, dexterity: a.dexterity, stamina: a.stamina,
            charisma: a.charisma, manipulation: a.manipulation, appearance: a.appearance,
          });
          await actor.update({
            'system.attributes.strength': Math.min(a.strength + 3, 10),
            'system.attributes.dexterity': Math.min(a.dexterity + 3, 10),
            'system.attributes.stamina': Math.min(a.stamina + 3, 10),
            'system.attributes.charisma': 0, 'system.attributes.manipulation': 0, 'system.attributes.appearance': 0,
          });
          await markActive('vicissitude');
          await whisperActivation(actor, pName, 'Physical +3, Social set to 0, +1 brawl damage.', power.cost);
          return;
        }

        await whisperActivation(actor, pName, null, power.cost);
      });
    });
  }


  // -- Aura chart (Auspex) --------------------------------------------------

  _showAuraChart() {
    const emotions = [
      ['Afraid', 'Orange', '#e87800'],
      ['Aggressive', 'Purple', '#8b008b'],
      ['Angry', 'Red', '#dc143c'],
      ['Bitter', 'Brown', '#8b4513'],
      ['Calm', 'Light Blue', '#87ceeb'],
      ['Compassionate', 'Pink', '#ff69b4'],
      ['Conservative', 'Lavender', '#b8a9c9'],
      ['Depressed', 'Gray', '#808080'],
      ['Desirous / Lustful', 'Deep Red', '#8b0000'],
      ['Distrustful', 'Light Green', '#78c878'],
      ['Envious', 'Dark Green', '#2d6e2d'],
      ['Excited', 'Violet', '#9b59b6'],
      ['Generous', 'Rose', '#e84080'],
      ['Happy', 'Vermilion', '#e34234'],
      ['Hateful', 'Black', '#1a1a1a'],
      ['Idealistic', 'Yellow', '#e6c619'],
      ['Innocent', 'White', '#e8e8e8'],
      ['Lovestruck', 'Blue', '#4169e1'],
      ['Obsessed', 'Green', '#2e8b2e'],
      ['Sad', 'Silver', '#b0b0b0'],
      ['Spiritual', 'Gold', '#d4a940'],
      ['Suspicious', 'Dark Blue', '#1a3a6e'],
    ];

    const special = [
      ['Anxious', 'Scrambled, like static or white noise'],
      ['Confused', 'Mottled, shifting colors'],
      ['Diablerist', 'Black veins in aura'],
      ['Daydreaming', 'Sharp flickering colors'],
      ['Frenzied', 'Rapidly rippling colors'],
      ['Psychotic', 'Hypnotic, swirling colors'],
      ['Vampire', 'Aura colors are pale'],
      ['Ghoul', 'Pale blotches in the aura'],
      ['Magic Use', 'Myriad sparkles in aura'],
      ['Werebeast', 'Bright, vibrant aura'],
      ['Ghost', 'Weak, intermittent aura'],
      ['Faerie', 'Rainbow highlights in aura'],
    ];

    const emotionRows = emotions.map(([cond, color, hex]) =>
      `<tr><td>${cond}</td><td><span class="aura-swatch" style="background:${hex}"></span>${color}</td></tr>`
    ).join('');

    const specialRows = special.map(([cond, desc]) =>
      `<tr><td>${cond}</td><td>${desc}</td></tr>`
    ).join('');

    const content = `
      <div class="aura-chart">
        <table>${emotionRows}</table>
        <h3>Supernatural & Special</h3>
        <table>${specialRows}</table>
      </div>`;

    new Dialog({
      title: 'Aura Colors',
      content,
      buttons: { ok: { label: 'Close' } },
      default: 'ok',
    }, { classes: ['vtm-v20', 'aura-dialog'], width: 380 }).render(true);
  }


  // -- Image lightbox -------------------------------------------------------

  _openLightbox(src) {
    const overlay = document.createElement('div');
    overlay.classList.add('vtm-lightbox');

    const pic = document.createElement('img');
    pic.src = src;
    overlay.appendChild(pic);

    let zoom = 1;
    overlay.addEventListener('wheel', ev => {
      ev.preventDefault();
      zoom = Math.min(Math.max(zoom + (ev.deltaY < 0 ? 0.15 : -0.15), 0.3), 5);
      pic.style.transform = `scale(${zoom})`;
    }, { passive: false });

    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('active'));
    pic.addEventListener('transitionend', () => overlay.classList.add('zooming'), { once: true });

    overlay.addEventListener('click', () => {
      overlay.classList.remove('zooming');
      pic.style.transform = `scale(0.3)`;
      overlay.classList.remove('active');
      overlay.addEventListener('transitionend', () => overlay.remove(), { once: true });
    });
  }
}
