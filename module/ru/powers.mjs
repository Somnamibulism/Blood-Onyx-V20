import { canonicalName } from './naming.mjs';
import { effectiveTraitValue } from '../discipline-effects.mjs';

// Explicit V20 mechanics for shipped disciplines, independent of display names
// and of old item copies already saved in a world.
const ROLL_OVERRIDES = {
  'chimerstry:lvl5': ['attributes.manipulation','abilities.subterfuge'],
  'quietus:lvl3': ['attributes.stamina',''],
};
const NO_ROLL = new Set(['auspex:lvl1']);
const REQUIRED_TARGETS = new Set([
  'dominate:lvl1','dominate:lvl2','dominate:lvl3','dominate:lvl4','dominate:lvl5',
  'auspex:lvl4',
  'dementation:lvl1','dementation:lvl2','dementation:lvl5',
  'presence:lvl2','presence:lvl3',
  'chimerstry:lvl5', 'obfuscate:lvl4', 'quietus:lvl3', 'animalism:lvl3',
]);
const idFor=(item,key)=>`${canonicalName(item?.name).toLowerCase()}:${key}`;
const number=(v,fallback=0)=>Number.isFinite(Number(v))?Number(v):fallback;
const bounded=v=>Math.max(2,Math.min(10,number(v,6)));
const traitValue=(actor,path)=>Math.max(0,number(effectiveTraitValue(actor,path)));
const wpCurrent=actor=>Math.max(0,number(actor?.system?.willpower?.value));
const wpPermanent=actor=>Math.max(0,number(actor?.system?.willpower?.max));

export function canUsePower(actor,item,key){
  if (!actor || !item || !['discipline','path'].includes(item.type)) return false;
  if(item.parent && item.parent.id!==actor.id) return false;
  const lvl=Number(String(key).match(/^lvl([1-5])$/)?.[1]);
  return Number.isInteger(lvl) && lvl>=1 && lvl<=Math.min(5,Math.max(0,number(item.system?.level)))
    && !!item.system?.powers?.[key];
}

export function powerUsesRoll(item,key){
  const id=idFor(item,key);
  if(NO_ROLL.has(id)) return false;
  return !!(ROLL_OVERRIDES[id]?.[0] || item?.system?.powers?.[key]?.primary);
}
export function powerRequiresTarget(item,key){return REQUIRED_TARGETS.has(idFor(item,key));}

export function preparePower(actor,item,key,target){
  if(!canUsePower(actor,item,key)) return {error:'Способность не изучена: сначала вложи соответствующее число точек в дисциплину.'};
  const power={...item.system.powers[key]};
  const id=idFor(item,key), discipline=canonicalName(item.name).toLowerCase();
  const audit={powerName:power.name||item.name, source:actor.name, target:target?.name||null,
    difficultyBasis:'Задана в карточке способности', note:'', resistance:null, threshold:null};
  const required=powerRequiresTarget(item,key);
  if(required && !target) return {error:'Для этой силы нужно выбрать цель на сцене.'};
  if(ROLL_OVERRIDES[id]) [power.primary,power.secondary]=ROLL_OVERRIDES[id];
  if(NO_ROLL.has(id)) power.primary='';
  const targetValue=(path)=>traitValue(target,path);
  const calc=(value,basis)=>{power.difficulty=value;audit.difficultyBasis=basis;};

  if(discipline==='dominate' && target){
    if(target.type==='vampire' && number(target.system.generation)<number(actor.system.generation))
      return {error:'Доминирование не действует на вампира более низкого поколения.'};
    if(key==='lvl5'){
      if(target.type==='vampire') return {error:'Одержимость Доминирования требует подходящего смертного носителя.'};
      calc(7,'Доминирование V: фиксированная сложность 7 у обоих участников');
      audit.resistance={primary:'willpower',secondary:'',difficulty:7,
        basis:'Сила воли цели; встречная проверка, сложность 7'};
      audit.note='Чистые успехи захвата снимают временную Волю цели. Полное вселение разрешается отдельным броском после её исчерпания.';
    } else calc(wpCurrent(target),`Текущая Воля цели: ${wpCurrent(target)}`);
  }
  if(id==='auspex:lvl4' && target){
    calc(wpCurrent(target),`Текущая Воля цели: ${wpCurrent(target)}`);
    if(target.type!=='mortal')power.cost='1 Willpower';
  }
  if(discipline==='dementation' && target){
    if(key==='lvl1')calc(target.system.humanity,`Человечность / Путь цели: ${target.system.humanity}`);
    if(key==='lvl2')calc(targetValue('attributes.perception')+number(target.system.virtues?.selfControl),
      `Восприятие цели ${targetValue('attributes.perception')} + Самоконтроль ${number(target.system.virtues?.selfControl)}`);
    if(key==='lvl5')calc(wpCurrent(target),`Текущая Воля цели: ${wpCurrent(target)}`);
  }
  if(discipline==='presence' && target){
    if(key==='lvl2')calc(targetValue('attributes.wits')+number(target.system.virtues?.courage),
      `Сообразительность цели ${targetValue('attributes.wits')} + Храбрость ${number(target.system.virtues?.courage)}`);
    if(key==='lvl3')calc(wpCurrent(target),`Текущая Воля цели: ${wpCurrent(target)}`);
  }
  if(id==='chimerstry:lvl5' && target)
    calc(targetValue('attributes.perception')+number(target.system.virtues?.selfControl),
      `Восприятие цели ${targetValue('attributes.perception')} + Самоконтроль ${number(target.system.virtues?.selfControl)}`);
  if(id==='obfuscate:lvl4' && target)
    calc(targetValue('attributes.wits')+targetValue('abilities.alertness'),
      `Сообразительность цели ${targetValue('attributes.wits')} + Бдительность ${targetValue('abilities.alertness')}`);
  if(id==='quietus:lvl3' && target){
    calc(wpPermanent(target),`Постоянная Воля цели: ${wpPermanent(target)}`);
    audit.resistance={primary:'attributes.stamina',secondary:'',difficulty:bounded(wpPermanent(actor)),
      basis:`Выносливость цели; сложность = постоянная Воля атакующего ${wpPermanent(actor)}`};
    audit.note='Зов Дагона: чистые успехи причиняют летальный урон по правилам V20. Требуется предварительное прикосновение.';
  }
  if(id==='quietus:lvl2' && target){
    audit.resistance={primary:'attributes.stamina',secondary:'',difficulty:6,includeFortitude:true,
      basis:'Выносливость + Стойкость цели, сложность 6'};
    audit.note='Сопротивление яду требует отдельной проверки после попадания. Расход крови определяет эффект.';
  }
  if(id==='animalism:lvl3' && target){
    calc(7,'Усмирение Зверя: фиксированная сложность 7');
    audit.threshold=wpPermanent(target);
    audit.note=`Продолжительная проверка: необходимо накопить ${audit.threshold} успехов (постоянная Воля цели). Не подавляет Зверя вампира обычным способом.`;
  }
  if(id==='auspex:lvl3') audit.note='Сложность 4–9 зависит от возраста предмета и силы впечатлений; уточни у рассказчицы.';
  if(id==='auspex:lvl5') audit.note='Для астральной проекции сложность зависит от расстояния (обычно 5/7/9).';
  power.difficulty=bounded(power.difficulty);
  return {power,audit};
}
