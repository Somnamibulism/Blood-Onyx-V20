// Audit helpers: these functions only inspect dice/actors and prepare chat output.
// They never roll dice, change the outcome, or edit actor data.
import { countDamage, trackSize } from './health-track.mjs';
const damageNames = Object.freeze({
  bashing: 'ударный', lethal: 'летальный', aggravated: 'аггравированный',
});
const conditionNames = Object.freeze({
  Unharmed: 'Без ран', Bruised: 'Ушиблен', Hurt: 'Повреждён', Injured: 'Ранен',
  Wounded: 'Тяжело ранен', Mauled: 'Изувечен', Crippled: 'Искалечен', Incapacitated: 'Недееспособен',
});
const asNumber = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const sequence = dice => Array.isArray(dice) && dice.length
  ? dice.map(d => String(d.value)).join(', ')
  : null;

// Counts are derived from the actual results rather than re-rolling or trusting
// the label on a maneuver. The engine remains the only authority on the outcome.
export function auditDice(dice, difficulty = 6, { automatic = 0, specialty = false } = {}) {
  if (!Array.isArray(dice) || !dice.length) return null;
  const threshold = asNumber(difficulty);
  const hits = dice.filter(d => asNumber(d.value) >= threshold).length;
  const tens = specialty ? dice.filter(d => asNumber(d.value) === 10).length : 0;
  const ones = dice.filter(d => asNumber(d.value) === 1).length;
  const auto = Math.max(0, asNumber(automatic));
  const total = Math.max(0, hits + tens - ones) + auto;
  const breakdown = `${hits} успешных кубиков${specialty ? ` + ${tens} бонус за десятки (специализация)` : ''} − ${ones} единиц = ${Math.max(0, hits + tens - ones)}; автоматических успехов ${auto}; всего ${total}`;
  return { hits, tens, ones, auto, total, breakdown };
}

export function snapshotHealth(actor) {
  if (!actor?.system?.health?.levels) return null;
  const { bash, leth, agg } = countDamage(actor.system);
  return { bash, leth, agg, slots: trackSize(actor.system), condition: actor.system.health?.levels?.incapacitated ? 'Недееспособен' : null };
}

// An acknowledged GM socket request is different from independently seeing an
// updated foreign actor. Chat must not claim the client verified that change.
export function healthChangeAudit({ before, after, requested = 0, remote = false, acknowledgement = null } = {}) {
  const amount = Math.max(0, asNumber(requested));
  if (!before || !after) return null;
  const describe = x => `ударных ${x.bash}, летальных ${x.leth}, аггравированных ${x.agg} (всего ${x.bash + x.leth + x.agg}/${x.slots})`;
  const changed = before.bash !== after.bash || before.leth !== after.leth || before.agg !== after.agg;
  const diff = `Δ ударных ${after.bash - before.bash >= 0 ? '+' : ''}${after.bash - before.bash}, ` +
    `летальных ${after.leth - before.leth >= 0 ? '+' : ''}${after.leth - before.leth}, ` +
    `аггравированных ${after.agg - before.agg >= 0 ? '+' : ''}${after.agg - before.agg}`;
  const accepted = Number(acknowledgement?.applied);
  let note = '';
  let status = 'checked';
  if (!amount) note = 'Нанесено 0: запись здоровья не требовалась.';
  else if (remote) {
    status = 'remote';
    note = Number.isFinite(accepted)
      ? `Ведущий подтвердил применение ${accepted} ур.; состояние чужого токена на этом клиенте может обновиться позднее.`
      : 'Команда передана ведущему; состояние чужого токена локально не подтверждено.';
  } else if (changed) {
    note = `Лист цели обновлён. Запрошено ${amount} ур.; при заполненной шкале уровни ран могут усиливаться вместо добавления ячеек.`;
  } else {
    status = 'warning';
    note = `ВНИМАНИЕ: запрошено ${amount} ур., но шкала до и после одинакова. Проверь переполнение шкалы и права записи.`;
  }
  return { before: describe(before), after: describe(after), diff, note, status, requested: amount };
}

export function buildDamageReport(data = {}) {
  const steps = [];
  const totalDamage = Math.max(0, asNumber(data.dmgSuccesses));
  const soaked = Math.max(0, asNumber(data.soakSuccesses));
  const remainder = Math.max(0, totalDamage - soaked);
  const netDamage = Math.max(0, asNumber(data.netDamage));
  const type = damageNames[String(data.damageType || '').toLowerCase()] || data.damageType || 'специальный';
  const dmgRolls = sequence(data.dmgDice);
  const soakRolls = sequence(data.soakDice);
  const fixed = !dmgRolls;
  const dmgAudit = auditDice(data.dmgDice, data.dmgDifficulty ?? 6, { automatic: data.dmgAutoSuccesses });
  const soakAudit = auditDice(data.soakDice, data.soakDifficulty ?? 6);
  const defender = data.defenderName || 'Цель';
  const attacker = data.attackerName || 'Источник';

  if (data.compared) {
    steps.push({
      label: 'Попадание',
      text: data.automaticHit
        ? 'Цель обездвижена: автоматическое попадание.'
        : `${asNumber(data.attackSuccesses)} успехов атаки − ${asNumber(data.defenseSuccesses)} успехов защиты = ${Math.max(0, asNumber(data.netSuccesses))} чистых успехов. ${data.defenseLabel || ''}`.trim(),
    });
  }
  steps.push({ label: 'Участники', text: `${attacker} → ${defender}; действие: ${data.weaponName || 'урон'}; тип: ${type}.` });
  if (fixed) {
    steps.push({ label: 'Источник', text: `Фиксированный урон: ${totalDamage}; броска урона не было. ${data.dmgLabel || ''}`.trim() });
  } else {
    const pool = Math.max(0, asNumber(data.dmgPool));
    const diff = data.dmgDifficulty ?? 6;
    const auto = Math.max(0, asNumber(data.dmgAutoSuccesses));
    const rolled = data.dmgDiceTotal === undefined ? totalDamage - auto : Math.max(0, asNumber(data.dmgDiceTotal));
    steps.push({ label: 'Бросок урона', text: `${attacker}: ${pool}d10, сложность ${diff}; выпало [${dmgRolls}]. ${rolled} успехов после учёта единиц${auto ? ` + ${auto} автоматических = ${totalDamage}` : ` = ${totalDamage}`}.` });
    if (dmgAudit) steps.push({ label: 'Проверка кубов урона', text: dmgAudit.breakdown });
    if (data.dmgLabel) steps.push({ label: 'Формула пула', text: String(data.dmgLabel) });
  }
  if (data.disarmMode) {
    steps.push({ label: 'Обезоруживание', text: `${totalDamage} успехов против Силы ${asNumber(data.disarmStr)}. ${data.disarmSuccess ? 'Оружие выбито.' : 'Оружие удержано.'} Здоровье не уменьшается.` });
    return { steps, final: 'Урона здоровью нет: маневр обезоруживания.', finalClass: 'is-zero' };
  }
  if (data.soakSkipped) {
    steps.push({ label: 'Поглощение', text: `${defender}: бросок не выполнялся; поглощено 0. ${data.soakLabel || 'Нет допустимого пула либо бросок не требуется.'}` });
  } else {
    const pool = Math.max(0, asNumber(data.soakPool));
    const diff = data.soakDifficulty ? `, сложность ${data.soakDifficulty}` : '';
    const dice = soakRolls ? `; выпало [${soakRolls}]` : '; бросок не потребовался';
    const stopped = Math.min(totalDamage, soaked);
    steps.push({ label: 'Поглощение', text: `${defender}: ${pool}d10${diff}${dice}; успехов поглощения ${soaked}, остановлено ${stopped} из ${totalDamage}. ${data.soakLabel || ''}`.trim() });
    if (soakAudit) steps.push({ label: 'Проверка кубов поглощения', text: soakAudit.breakdown });
  }
  steps.push({ label: 'После поглощения', text: `max(0, ${totalDamage} − ${soaked}) = ${remainder} (${type} урон).` });
  if (remainder !== netDamage && !data.kissMode) {
    steps.push({ label: 'Поправка', text: `${remainder} → ${netDamage} уровней по правилам цели.${data.damageAdjustment ? ` ${data.damageAdjustment}` : ''}` });
  } else if (data.damageAdjustment) {
    steps.push({ label: 'Особое правило', text: String(data.damageAdjustment) });
  }
  if (data.kissMode) {
    if (data.healthAudit) steps.push({ label: 'Здоровье', text: `Поцелуй: ${data.healthAudit.note}` });
    return {
      steps,
      final: data.kissPenetrated ? 'Поцелуй действует; уровни здоровья не списываются.' : 'Укус не прошел защиту; уровни здоровья не списываются.',
      finalClass: 'is-zero', healthAudit: data.healthAudit || null,
    };
  }
  if (data.healthAudit) {
    steps.push({ label: 'Здоровье до', text: `${defender}: ${data.healthAudit.before}` });
    steps.push({ label: 'Здоровье после', text: `${defender}: ${data.healthAudit.after}; ${data.healthAudit.diff || 'изменение неизвестно'}.` });
    steps.push({ label: 'Подтверждение записи', text: data.healthAudit.note });
  } else {
    steps.push({ label: 'Изменение листа', text: 'Снимок здоровья до/после отсутствует: в этом источнике отображается расчёт, но фактическая запись не проверена.' });
  }
  if (data.condition) steps.push({ label: 'Состояние цели', text: `${defender}: ${conditionNames[data.condition] || data.condition}${data.penalty ? `; штраф ${data.penalty}` : ''}.` });
  if (data.dazedNotice) steps.push({ label: 'Оглушение', text: String(data.dazedNotice) });
  if (data.firearmNote) steps.push({ label: 'Особое правило', text: String(data.firearmNote) });
  if (data.armorDestroyedNotice) steps.push({ label: 'Броня', text: String(data.armorDestroyedNotice) });
  if (data.quillsNotice) steps.push({ label: 'Контрудар', text: String(data.quillsNotice) });
  return {
    steps,
    final: netDamage ? `Здоровье (${data.defenderName || 'цель'}): применено ${netDamage} ур. (${type}).` : '0 уровней: урон полностью остановлен или сведен к нулю.',
    finalClass: netDamage ? 'is-hit' : 'is-zero',
    healthAudit: data.healthAudit || null,
  };
}

export async function renderDamageCard(data) {
  return renderTemplate('systems/vtm-v20/templates/damage-card.hbs', {
    ...data,
    detailedReport: buildDamageReport(data),
  });
}
