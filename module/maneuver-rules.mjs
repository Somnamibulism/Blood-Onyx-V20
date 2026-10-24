// Blood Onyx ru.7 — V20 close combat maneuver rules, following the user's Russian V20 reference.
// Accuracy modifiers affect the attack pool; difficulty modifies the target number.
export const CLOSE_COMBAT_MANEUVER_RULES = Object.freeze({
  unarmed: {name:'Удар рукой', traits:['attributes.dexterity','abilities.brawl'], accuracy:0, difficulty:0, damage:'Str', damageType:'bashing'},
  kick: {name:'Удар ногой', traits:['attributes.dexterity','abilities.brawl'], accuracy:0, difficulty:1, damage:'Str+1', damageType:'bashing'},
  throw: {name:'Бросок', traits:['attributes.strength','abilities.brawl'], accuracy:0, difficulty:1, damage:'Str+1', damageType:'bashing', knockdown:true},
  clinch: {name:'Клинч', traits:['attributes.strength','abilities.brawl'], accuracy:0, difficulty:0, damage:'Str', damageType:'bashing', continuing:true},
  hold: {name:'Захват', traits:['attributes.strength','abilities.brawl'], accuracy:0, difficulty:0, damage:null, continuing:true},
  sweep: {name:'Подсечка', traits:['attributes.dexterity','abilities.brawl'], accuracy:0, difficulty:1, damage:'Str', damageType:'bashing', knockdown:true},
  disarm: {name:'Обезоруживание', traits:['attributes.dexterity','abilities.melee'], accuracy:0, difficulty:1, damage:null},
  bite: {name:'Укус', traits:['attributes.dexterity','abilities.brawl'], accuracy:1, difficulty:0, damage:'Str+1', damageType:'aggravated'},
  claws: {name:'Удар когтями', traits:['attributes.dexterity','abilities.brawl'], accuracy:0, difficulty:0, damage:'Str+1', damageType:'aggravated'},
  dodge: {name:'Уклонение', traits:['attributes.dexterity','abilities.athletics'], accuracy:0, difficulty:0, damage:null, defensive:true},
  block: {name:'Блок', traits:['attributes.dexterity','abilities.brawl'], accuracy:0, difficulty:0, damage:null, defensive:true},
  parry: {name:'Парирование', traits:['attributes.dexterity','abilities.melee'], accuracy:0, difficulty:0, damage:null, defensive:true},
});
// V20 p.272: successfully striking a target always permits at least one damage die.
export function damageDiceCount(pool) { return Math.max(1, Math.floor(Number(pool) || 0)); }
// V20 p.274: no soaking dice means no soak roll, not a free die.
export function soakDiceCount(pool) { return Math.max(0, Math.floor(Number(pool) || 0)); }
// Wound penalties that reduce an ACTION pool to zero prevent the action (V20 p.121).
export function actionDiceCount(pool) { return Math.max(0, Math.floor(Number(pool) || 0)); }
