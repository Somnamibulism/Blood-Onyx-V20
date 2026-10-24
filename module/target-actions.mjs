// Shared V20 scene targeting and actor health/status application.
// A token (rather than an actor prototype) is the unit of targeting: unlinked
// NPC tokens must not accidentally modify every copy of the same creature.
import { countDamage, rebuildTrack, trackSize } from './health-track.mjs';

export const TARGET_STATUSES = [
  { id: 'vtm-blinded', name: 'Ослепление' },
  { id: 'vtm-dazed', name: 'Оглушение' },
  { id: 'vtm-incapacitated', name: 'Недееспособность' },
  { id: 'vtm-prone', name: 'Лежит' },
  { id: 'vtm-knockdown', name: 'Сбит с ног' },
  { id: 'vtm-immobilized-struggling', name: 'Частичное обездвиживание' },
  { id: 'vtm-immobilized-full', name: 'Полное обездвиживание' },
  { id: 'vtm-frenzy', name: 'Безумие' },
  { id: 'vtm-rotschreck', name: 'Ротшрек' },
];

const pending = new Map();
const MAX_EFFECT_AMOUNT = 20;

export function sceneTargets() {
  return (canvas?.ready ? (canvas.tokens?.placeables ?? []) : [])
    .filter(t => t.actor && t.document && t.visible)
    .map(t => ({ id: t.id, name: t.name || t.actor.name, token: t, actor: t.actor }));
}

export async function pickSceneTarget({ title = 'Выбор цели', allowNone = false, resourceActor = null } = {}) {
  const options = sceneTargets();
  if (!options.length) {
    if (allowNone) return { token: null, actor: null, cancelled: false };
    ui.notifications.warn('На открытой сцене нет доступных токенов с персонажами.');
    return { cancelled: true };
  }
  const selected = [...(game.user.targets || [])].find(t => options.some(o => o.id === t.id));
  const escape = foundry.utils.escapeHTML;
  const rows = options.map(o => `<option value="${escape(o.id)}" ${o.id === selected?.id ? 'selected' : ''}>${escape(o.name)}${o.actor.type === 'vampire' ? ' · Вампир' : ''}</option>`).join('');
  const wp = resourceActor?.system.willpower?.value || 0;
  const wpToggle = wp && !resourceActor?.getFlag('vtm-v20', 'wpSpent') ? `<label><input type="checkbox" name="spendWp"/> Потратить 1 Волю: +1 автоматический успех (${wp} осталось)</label>` : '';
  const html = `<form class="vtm-target-choice"><label class="vtm-target-choice-label">Все персонажи на сцене, включая союзников и вашего героя</label><select name="targetId" class="vtm-target-choice-select">${allowNone ? '<option value="">Без цели / на себя</option>' : ''}${rows}</select><p class="hint">Выбранная цель также отмечается на карте Foundry.</p>${wpToggle}</form>`;
  const choice = await new Promise(resolve => new Dialog({
    title, content: html,
    buttons: {
      choose: { label: 'Выбрать', icon: '<i class="fas fa-crosshairs"></i>', callback: dlg => resolve({ id: dlg[0].querySelector('[name="targetId"]').value, spendWillpower: !!dlg[0].querySelector('[name="spendWp"]')?.checked }) },
      cancel: { label: 'Отмена', callback: () => resolve(null) },
    }, default: 'choose', close: () => resolve(null),
  }, { classes: ['vtm-v20', 'dialog', 'vtm-target-dialog'], width: 410 }).render(true));
  if (choice === null) return { cancelled: true };
  if (!choice.id) return { token: null, actor: null, cancelled: false, spendWillpower: choice.spendWillpower };
  const target = options.find(o => o.id === choice.id);
  if (!target) { ui.notifications.warn('Цель покинула сцену.'); return { cancelled: true }; }
  await target.token.setTarget(true, { user: game.user, releaseOthers: true, groupSelection: false });
  return { token: target.token, actor: target.actor, cancelled: false, spendWillpower: choice.spendWillpower };
}

export function healCounts(sys, amount, damageType = 'normal') {
  const counts = countDamage(sys);
  let left = Math.max(0, Math.min(Math.trunc(amount) || 0, MAX_EFFECT_AMOUNT));
  let healed = 0;
  const order = damageType === 'aggravated' ? ['agg'] : damageType === 'bashing' ? ['bash'] : damageType === 'lethal' ? ['leth'] : ['leth', 'bash'];
  for (const key of order) {
    const n = Math.min(left, counts[key]);
    counts[key] -= n;
    left -= n;
    healed += n;
  }
  return { counts, healed };
}

export function damageCounts(sys, amount, type = 'bashing') {
  const counts = countDamage(sys);
  const key = type === 'aggravated' ? 'agg' : type === 'lethal' ? 'leth' : 'bash';
  const total = Math.max(0, Math.min(Math.trunc(amount) || 0, MAX_EFFECT_AMOUNT));
  const capacity = trackSize(sys);
  for (let i = 0; i < total; i++) {
    if (counts.agg + counts.leth + counts.bash < capacity) counts[key]++;
    else if (key === 'agg') {
      if (counts.leth) { counts.leth--; counts.agg++; }
      else if (counts.bash) { counts.bash--; counts.agg++; }
    } else if (counts.bash) { counts.bash--; counts.leth++; }
  }
  return counts;
}

function locate(data) {
  if (data.targetTokenId && canvas?.ready) return canvas.tokens?.get(data.targetTokenId)?.actor ?? null;
  return data.targetActorId ? game.actors.get(data.targetActorId) : null;
}

async function localEffect(actor, data) {
  if (data.kind === 'heal') {
    const { counts, healed } = healCounts(actor.system, data.amount, data.damageType);
    if (healed) await actor.update(rebuildTrack(actor.system, counts));
    return { applied: healed };
  }
  if (data.kind === 'damage') {
    const total = Math.max(0, Math.min(Math.trunc(data.amount) || 0, MAX_EFFECT_AMOUNT));
    if (total) await actor.update(rebuildTrack(actor.system, damageCounts(actor.system, total, data.damageType)));
    return { applied: total };
  }
  if (data.kind === 'status') {
    if (!TARGET_STATUSES.some(s => s.id === data.statusId)) throw new Error('Неизвестный статус.');
    // Foundry Actor#toggleStatusEffect integrates with token icons and active effects.
    await actor.toggleStatusEffect(data.statusId, { active: true });
    return { applied: 1 };
  }
  throw new Error('Неизвестное действие над целью.');
}

// For player-owned actors update immediately; a GM applies updates to foreign
// actor sheets in multiplayer. The first active GM handles each request once.
export async function applyTargetEffect({ source, token = null, actor = null, item = null, kind, amount = 1, damageType = 'normal', statusId = null } = {}) {
  const target = token?.actor || actor;
  if (!target || !source) throw new Error('Не указаны источник или цель.');
  if (!['heal','damage','status'].includes(kind)) throw new Error('Неизвестный вид эффекта.');
  const safeAmount = Math.max(0, Math.min(Math.trunc(amount) || 0, MAX_EFFECT_AMOUNT));
  const req = {
    sourceActorId: source.id, sourceTokenId: canvas?.tokens?.placeables.find(t => t.actor === source)?.id || null,
    targetTokenId: token?.id || canvas?.tokens?.placeables.find(t => t.actor === target)?.id || null,
    targetActorId: target.isToken ? null : target.id,
    itemId: item?.id || null, kind, amount: safeAmount, damageType, statusId,
  };
  if (game.user.isGM || target.isOwner) return localEffect(target, req);
  const gm = game.users.find(u => u.active && u.isGM);
  if (!gm) throw new Error('Для изменения чужого листа нужен подключённый ведущий.');
  const requestId = foundry.utils.randomID();
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { pending.delete(requestId); reject(new Error('Ведущий не ответил на изменение цели.')); }, 10000);
    pending.set(requestId, { resolve, reject, timeout });
    game.socket.emit('system.vtm-v20', { action: 'vtmTargetEffect', requestId, requesterId: game.user.id, ...req });
  });
}

export function bindTargetEffectSockets() {
  game.socket.on('system.vtm-v20', async data => {
    if (data?.action === 'vtmTargetEffectResult' && data.requesterId === game.user.id) {
      const p = pending.get(data.requestId);
      if (!p) return;
      clearTimeout(p.timeout);
      pending.delete(data.requestId);
      if (data.error) p.reject(new Error(data.error)); else p.resolve(data.result);
      return;
    }
    if (data?.action !== 'vtmTargetEffect' || !game.user.isGM) return;
    const gm = game.users.filter(u => u.active && u.isGM).sort((a,b) => a.id.localeCompare(b.id))[0];
    if (gm?.id !== game.user.id) return;
    let result, error;
    try {
      const user = game.users.get(data.requesterId);
      const source = data.sourceTokenId ? canvas.tokens?.get(data.sourceTokenId)?.actor : game.actors.get(data.sourceActorId);
      const target = locate(data);
      if (!user?.active || !source || !target || !source.testUserPermission(user, 'OWNER')) throw new Error('Нет прав на применение эффекта.');
      if (data.itemId && !source.items.get(data.itemId)) throw new Error('Способность не найдена.');
      if (!['heal','damage','status'].includes(data.kind)) throw new Error('Недопустимый тип эффекта.');
      result = await localEffect(target, data);
    } catch (e) { error = e.message || 'Ошибка применения эффекта.'; }
    game.socket.emit('system.vtm-v20', { action: 'vtmTargetEffectResult', requesterId: data.requesterId, requestId: data.requestId, result, error });
  });
}

export async function chooseHealing(actor, target, { title = 'Лечение', bloodCost = true } = {}) {
  const counts = countDamage(target.system);
  const blood = Math.max(0, Number(actor.system.blood?.value) || 0);
  if (!counts.bash && !counts.leth && !counts.agg) { ui.notifications.info('У цели нет повреждений.'); return null; }
  const opts = [
    {type: 'normal', name: 'Ударные и летальные', cap: counts.bash + counts.leth, price: 1},
    {type: 'aggravated', name: 'Аггравированные', cap: counts.agg, price: 2},
  ].filter(o => o.cap && (!bloodCost || blood >= o.price));
  if (!opts.length) { ui.notifications.warn('Недостаточно крови для лечения.'); return null; }
  const rows = opts.map(o => `<option value="${o.type}">${o.name} (${o.price} крови за уровень, ран: ${o.cap})</option>`).join('');
  const value = await new Promise(resolve => new Dialog({
    title, content: `<form class="vtm-heal-choice"><label>Тип ран</label><select name="type">${rows}</select><label>Уровней лечения</label><input name="amount" type="number" min="1" max="20" value="1"/><p class="hint">Один ход контакта с раной за каждый исцелённый уровень.</p></form>`,
    buttons: { ok: { label: 'Лечить', callback: dlg => resolve({ type: dlg[0].querySelector('[name="type"]').value, amount: Number(dlg[0].querySelector('[name="amount"]').value) }) }, cancel: { label: 'Отмена', callback: () => resolve(null) } },
    default: 'ok', close: () => resolve(null),
  }, { classes: ['vtm-v20','dialog'], width: 410 }).render(true));
  if (!value) return null;
  const choice = opts.find(o => o.type === value.type);
  if (!choice || !Number.isInteger(value.amount) || value.amount < 1 || value.amount > choice.cap || (bloodCost && value.amount * choice.price > blood)) {
    ui.notifications.warn('Число уровней превышает ранения цели или запас крови.'); return null;
  }
  return { ...value, cost: bloodCost ? value.amount * choice.price : 0 };
}
