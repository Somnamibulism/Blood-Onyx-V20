import { canonicalName } from './naming.mjs';
import { effectiveTraitValue } from '../discipline-effects.mjs';
// No player may roll or activate a power beyond the purchased Discipline dots.
// Check here as well as in the UI: hidden buttons alone are not permission checks.
export function canUsePower(actor, item, key) {
  if (!actor || !item || !['discipline', 'path'].includes(item.type)) return false;
  if (item.parent && item.parent.id !== actor.id) return false;
  const level = Number(String(key).match(/^lvl([1-5])$/)?.[1]);
  return Number.isInteger(level) && level >= 1 && level <= Math.min(5, Math.max(0, Number(item.system?.level) || 0))
    && !!item.system?.powers?.[key];
}

// Return configuration without mutating a world document or spending resources.
export function preparePower(actor, item, key, target) {
  if (!canUsePower(actor, item, key)) return { error: 'Способность не изучена: сначала вложи соответствующее число точек в дисциплину.' };
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
