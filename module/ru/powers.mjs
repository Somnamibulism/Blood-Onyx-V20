import { canonicalName } from './naming.mjs';
import { effectiveTraitValue } from '../discipline-effects.mjs';
// Return configuration without mutating a world document or spending resources.
export function preparePower(actor, item, key, target) {
  const power = {...item.system.powers[key]};
  const discipline = canonicalName(item.name).toLowerCase();
  const currentWP = target?.system.willpower?.value ?? 0;
  const targetTrait = path => effectiveTraitValue(target,path);
  const targetSelf = target?.system.virtues?.selfControl || 0;
  const targetNeeded = discipline==='dominate' || (discipline==='auspex'&&key==='lvl4') || (discipline==='dementation'&&['lvl1','lvl2','lvl5'].includes(key)) || (discipline==='presence'&&['lvl2','lvl3'].includes(key)) || (discipline==='chimerstry'&&key==='lvl5');
  if(targetNeeded&&!target) return {error:'Отметь одну цель на сцене перед применением этой силы.'};
  if(discipline==='dominate' && target.type==='vampire' && Number(target.system.generation)<Number(actor.system.generation)) return {error:'Доминирование не действует на вампира более низкого поколения.'};
  if(discipline==='dominate') {
    if(key==='lvl5'&&target.type==='vampire') return {error:'Одержимость Доминирования требует подходящего смертного носителя.'};
    if(key!=='lvl5') power.difficulty=currentWP;
  }
  if(discipline==='auspex'&&key==='lvl4') {
    power.difficulty=currentWP;
    if(target.type!=='mortal') power.cost='1 Willpower';
  }
  if(discipline==='dementation') {
    if(key==='lvl1') power.difficulty=target.system.humanity;
    if(key==='lvl2') power.difficulty=targetTrait('attributes.perception')+targetSelf;
    if(key==='lvl5') power.difficulty=currentWP;
  }
  if(discipline==='presence'&&key==='lvl2') power.difficulty=targetTrait('attributes.wits')+(target.system.virtues?.courage||0);
  if(discipline==='presence'&&key==='lvl3') power.difficulty=currentWP;
  if(discipline==='chimerstry'&&key==='lvl5') {
    power.primary='attributes.manipulation';power.secondary='abilities.subterfuge';
    power.difficulty=targetTrait('attributes.perception')+targetSelf;
  }
  power.difficulty=Math.max(2,Math.min(10,Number(power.difficulty)||6));
  return {power};
}
