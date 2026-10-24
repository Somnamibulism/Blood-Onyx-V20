// Presentation only: this module never rolls dice, edits actors, or updates combat flags.
// Every call to the damage-card template goes through this formatter so environmental
// damage, weapon attacks, ripostes, and manual hazards have the same clear audit trail.
const damageNames = Object.freeze({
  bashing: 'ударный', lethal: 'летальный', aggravated: 'аггравированный',
});
const asNumber = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const sequence = dice => Array.isArray(dice) && dice.length
  ? dice.map(d => String(d.value)).join(', ')
  : null;

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

  if (data.compared) {
    steps.push({
      label: 'Попадание',
      text: data.automaticHit
        ? 'Цель обездвижена: автоматическое попадание.'
        : `${asNumber(data.attackSuccesses)} успехов атаки − ${asNumber(data.defenseSuccesses)} успехов защиты = ${Math.max(0, asNumber(data.netSuccesses))} чистых успехов. ${data.defenseLabel || ''}`.trim(),
    });
  }
  if (fixed) {
    steps.push({ label: 'Источник', text: `Фиксированный урон: ${totalDamage}; броска урона не было. ${data.dmgLabel || ''}`.trim() });
  } else {
    const pool = Math.max(0, asNumber(data.dmgPool));
    const diff = data.dmgDifficulty ?? 6;
    const auto = Math.max(0, asNumber(data.dmgAutoSuccesses));
    const rolled = data.dmgDiceTotal === undefined ? totalDamage - auto : Math.max(0, asNumber(data.dmgDiceTotal));
    steps.push({ label: 'Бросок урона', text: `${pool}d10, сложность ${diff}; выпало [${dmgRolls}]. ${rolled} успехов после учета единиц${auto ? ` + ${auto} автоматических = ${totalDamage}` : ` = ${totalDamage}`}.` });
    if (data.dmgLabel) steps.push({ label: 'Формула пула', text: String(data.dmgLabel) });
  }
  if (data.disarmMode) {
    steps.push({ label: 'Обезоруживание', text: `${totalDamage} успехов против Силы ${asNumber(data.disarmStr)}. ${data.disarmSuccess ? 'Оружие выбито.' : 'Оружие удержано.'} Здоровье не уменьшается.` });
    return { steps, final: 'Урона здоровью нет: маневр обезоруживания.', finalClass: 'is-zero' };
  }
  if (data.soakSkipped) {
    steps.push({ label: 'Поглощение', text: `Бросок не выполнялся; поглощено 0. ${data.soakLabel || 'Нет допустимого пула либо бросок не требуется.'}` });
  } else {
    const pool = Math.max(0, asNumber(data.soakPool));
    const diff = data.soakDifficulty ? `, сложность ${data.soakDifficulty}` : '';
    const dice = soakRolls ? `; выпало [${soakRolls}]` : '; бросок не потребовался';
    const stopped = Math.min(totalDamage, soaked);
    steps.push({ label: 'Поглощение', text: `${pool}d10${diff}${dice}; успехов поглощения ${soaked}, остановлено ${stopped} из ${totalDamage}. ${data.soakLabel || ''}`.trim() });
  }
  steps.push({ label: 'После поглощения', text: `max(0, ${totalDamage} − ${soaked}) = ${remainder} (${type} урон).` });
  if (remainder !== netDamage && !data.kissMode) {
    steps.push({ label: 'Поправка', text: `${remainder} → ${netDamage} уровней по правилам цели.${data.damageAdjustment ? ` ${data.damageAdjustment}` : ''}` });
  } else if (data.damageAdjustment) {
    steps.push({ label: 'Особое правило', text: String(data.damageAdjustment) });
  }
  if (data.kissMode) {
    return {
      steps,
      final: data.kissPenetrated ? 'Поцелуй действует; уровни здоровья не списываются.' : 'Укус не прошел защиту; уровни здоровья не списываются.',
      finalClass: 'is-zero',
    };
  }
  if (data.condition) steps.push({ label: 'Состояние цели', text: `${data.condition}${data.penalty ? `; штраф ${data.penalty}` : ''}.` });
  return {
    steps,
    final: netDamage ? `Здоровье (${data.defenderName || 'цель'}): применено ${netDamage} ур. (${type}).` : '0 уровней: урон полностью остановлен или сведен к нулю.',
    finalClass: netDamage ? 'is-hit' : 'is-zero',
  };
}

export async function renderDamageCard(data) {
  return renderTemplate('systems/vtm-v20/templates/damage-card.hbs', {
    ...data,
    detailedReport: buildDamageReport(data),
  });
}
