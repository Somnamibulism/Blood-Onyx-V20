import { canonicalName } from './ru/naming.mjs';

const scope = 'vtm-v20';
export const quickPowers = Object.freeze({
  'protean:lvl2': 'Когти',
  'serpentis:lvl2': 'Язык аспида',
  'obtenebration:lvl3': 'Руки Бездны',
  'quietus:lvl4': 'Ласка Баала',
  'daimoinon:lvl3': 'Всесожжение',
});

export function rating(actor, name) {
  return Number(actor?.items?.find(i => i.type === 'discipline' && canonicalName(i.name).toLowerCase() === name.toLowerCase())?.system?.level || 0);
}
export function clawItem(actor) {return actor.items.find(i=>i.type==='weapon' && canonicalName(i.name).toLowerCase()==='feral claws');}
export function quickActive(actor, key) {
  if (key === 'protean:lvl2') return !!clawItem(actor);
  if (key === 'serpentis:lvl2') return !!actor.getFlag(scope,'onyxTongueActive');
  if (key === 'obtenebration:lvl3') return !!actor.getFlag(scope,'onyxTentacles');
  if (key === 'quietus:lvl4') return !!actor.getFlag(scope,'onyxBaalWeaponId');
  return false;
}
export function quickLabel(actor, key) {
  const title = quickPowers[key];
  return title ? (quickActive(actor,key) ? `Убрать: ${title}` : `Применить: ${title}`) : '';
}
export function canQuickUse(actor,key) {
  const [disc,level]=key.split(':lvl');
  return !!quickPowers[key] && Number.isInteger(Number(level)) && rating(actor,disc)>=Number(level);
}
async function spendBlood(actor, amount) {
  if (!Number.isInteger(amount) || amount<1) return false;
  if (Number(actor.system.blood?.value||0) < amount) {ui.notifications.warn('Недостаточно крови.');return false;}
  await actor.update({'system.blood.value': Number(actor.system.blood.value)-amount});
  return true;
}
async function note(actor, title, text) {
  const esc = foundry.utils.escapeHTML;
  await ChatMessage.create({user:game.user.id,speaker:ChatMessage.getSpeaker({actor}),style:CONST.CHAT_MESSAGE_STYLES.OTHER,
    content:`<div class="vtm-roll"><div class="roll-header"><b>${esc(title)}</b></div><p>${esc(text)}</p></div>`});
}
async function pickBlood(actor,min=1,max=1,title='Расход крови') {
  const available = Math.min(Number(actor.system.blood?.value||0),Number(actor.system.bloodPerTurn||1),max);
  if(available<min){ui.notifications.warn('Недостаточно доступной крови на ход.');return 0;}
  if(available===min) return min;
  return new Promise(resolve=>new Dialog({title,content:`<p>Кровь: от ${min} до ${available}. Лимит поколения за ход учитывается.</p><input class="onyx-power-blood" type="number" min="${min}" max="${available}" value="${min}"/>`,buttons:{ok:{label:'Применить',callback:el=>resolve(Math.max(min,Math.min(available,parseInt(el[0].querySelector('.onyx-power-blood').value)||min)))},cancel:{label:'Отмена',callback:()=>resolve(0)}},close:()=>resolve(0)}).render(true));
}
export async function useQuickPower(actor, key) {
  if (!canQuickUse(actor,key)) {ui.notifications.warn('Эта сила не изучена.');return false;}
  if(key==='protean:lvl2') {
    const existing=clawItem(actor);
    if(existing){await existing.delete();ui.notifications.info('Когти втянуты.');return true;}
    if(!(await spendBlood(actor,1)))return false;
    await actor.createEmbeddedDocuments('Item',[{name:'Feral Claws',type:'weapon',img:'systems/vtm-v20/VTM icons/claw-slashes.svg',system:{damage:'Str+1',damageType:'aggravated',equipped:true},flags:{'vtm-v20':{onyxTemporaryPower:'protean:lvl2'}}}]);
    await note(actor,'Звериные когти','1 кровь, 1 ход; длительность: сцена. Удар когтями в разделе «Бой»: Ловкость + Драка, Сила +1 аггравированный. Лазание: сложность −2.');
    return true;
  }
  if(key==='serpentis:lvl2') {
    if(quickActive(actor,key)) {await actor.unsetFlag(scope,'onyxTongueActive');ui.notifications.info('Язык аспида убран.');return true;}
    if(!(await spendBlood(actor,1)))return false;
    await actor.setFlag(scope,'onyxTongueActive',true);
    await note(actor,'Язык аспида','1 кровь. Атака появилась в боевых действиях. Ловкость + Драка/Фехтование (выбор навыка); Сила, аггравированный урон.');
    return true;
  }
  if(key==='obtenebration:lvl3') {
    if(quickActive(actor,key)){await actor.unsetFlag(scope,'onyxTentacles');ui.notifications.info('Щупальца рассеялись.');return true;}
    if(Number(actor.system.blood?.value||0)<1){ui.notifications.warn('Недостаточно крови.');return false;}
    const result=await game.vtm.rollDicePool(actor,{trait:'attributes.manipulation',trait2:'abilities.occult',difficulty:7,label:'Руки Бездны · призыв (V20)'});
    if(!result)return false; // Cancelling the dice dialog is free.
    if(!(await spendBlood(actor,1)))return false;
    const successes=Math.max(0,Number(result?.total||0));
    if(!successes){await note(actor,'Руки Бездны','Призыв не удался. Кровь потрачена.');return true;}
    const level=rating(actor,'Obtenebration');
    const strength=level+rating(actor,'Potence'), dexterity=level+rating(actor,'Celerity');
    await actor.setFlag(scope,'onyxTentacles',{count:successes,strength,dexterity});
    await note(actor,'Руки Бездны',`${successes} щупалец; каждое: Сила ${strength}, Ловкость ${dexterity}, 4 здоровья, длина 2 м. При установленном захвате сжатие: Сила щупальца +1, летальный урон/ход. Захват и сопротивление цели разрешает ведущий.`);
    return true;
  }
  if(key==='quietus:lvl4') {
    const old=actor.getFlag(scope,'onyxBaalWeaponId');
    if(old){await actor.unsetFlag(scope,'onyxBaalWeaponId');ui.notifications.info('Ласка Баала снята.');return true;}
    const weapons=actor.items.filter(i=>i.type==='weapon' && i.system.equipped && !i.system.firearm && !i.system.range && !i.system.thrown);
    if(!weapons.length){ui.notifications.warn('Нужно экипировать холодное оружие.');return false;}
    const chosen=await new Promise(resolve=>{
      const escape=foundry.utils.escapeHTML;
      const items=weapons.map(w=>`<option value="${escape(w.id)}">${escape(w.name)}</option>`).join('');
      new Dialog({title:'Ласка Баала',content:`<p>Выбери холодное оружие. После каждого успешного попадания потрать 1 кровь. Промахи бесплатны; аггравированный урон вместо обычного.</p><select class="onyx-baal-weapon">${items}</select>`,buttons:{ok:{label:'Смазать оружие',callback:el=>resolve(el[0].querySelector('.onyx-baal-weapon').value)},cancel:{label:'Отмена',callback:()=>resolve(null)}},close:()=>resolve(null)}).render(true);
    });
    if(!chosen)return false;
    await actor.setFlag(scope,'onyxBaalWeaponId',chosen);
    await note(actor,'Ласка Баала','Оружие смазано. При успешном попадании можно оплатить 1 кровь и заменить тип урона на аггравированный. Уточнение: расход после попадания, не за промах. В боевом окне тип урона помечен отдельно, а оплата требует подтверждения ведущего.');
    return true;
  }
  if(key==='daimoinon:lvl3') {
    // V20 Conflagration is fixed *health levels* rather than an ordinary damage pool.
    // Keep the original attack engine untouched; the GM handles dodge/soak from the chat receipt.
    const blood=await pickBlood(actor,1,Math.min(20,actor.system.blood?.value||0),'Всесожжение: сила огня');
    if(!blood)return false;
    const result=await game.vtm.rollDicePool(actor,{trait:'attributes.dexterity',trait2:'abilities.occult',difficulty:6,label:'Всесожжение · Ловкость + Оккультизм (V20)'});
    if(!result)return false; // Cancelling the dice dialog is free.
    if(!(await spendBlood(actor,blood)))return false;
    await note(actor,'Всесожжение',`Затрачено крови: ${blood}. Попадание: ${Number(result?.total||0)>0?'успех в проверке атаки; цель может уклониться':'атака не попала'}. При подтверждённом попадании: ${blood} уровн. аггравированного урона (НЕ кубиков) до поглощения. Цель проверяет Ротшрек как от обычного пламени той же величины. Ведущий разрешает уклонение и поглощение.`);
    return true;
  }
  return false;
}
