import { test } from 'node:test';
import assert from 'node:assert/strict';

const callbacks = {};
globalThis.Hooks = { on: (name, fn) => ((callbacks[name] ||= []).push(fn), fn) };
globalThis.game = {user: {id:'gm'}, packs: new Map(), i18n:{localize:s=>s}};
globalThis.ui = {notifications:{warn:()=>{},info:()=>{}}};
globalThis.foundry = {utils:{deepClone:structuredClone, escapeHTML:s=>String(s)}};
globalThis.ChatMessage = {getSpeaker:()=>({alias:'test'}),create:async()=>{}};
globalThis.CONST = {CHAT_MESSAGE_STYLES:{OTHER:0}};

const { syncClanDisciplines } = await import('../module/clan-auto.mjs');
const { cleanupUnavailableClaws, canQuickUse, quickActive, useQuickPower } = await import('../module/quick-combat-powers.mjs');

function makeActor(disciplineLevel=2) {
  const items=[{id:'protean',name:'Превращение',type:'discipline',system:{level:disciplineLevel}}];
  const flags = {};
  let counter=0;
  const actor={type:'vampire',uuid:'Actor.claws.test',name:'Гангрел',items,system:{blood:{value:7},bloodPerTurn:1},
    getFlag:(_scope,key)=>flags[key],
    setFlag:async(_scope,key,value)=>{flags[key]=value;},
    async deleteEmbeddedDocuments(_type,ids){for(const id of ids){const at=items.findIndex(i=>i.id===id);if(at>=0)items.splice(at,1);}},
    async createEmbeddedDocuments(_type,docs){const created=docs.map(d=>({id:'new-'+(++counter),...d}));items.push(...created);return created;},
    async update(data){if(data['system.blood.value']!==undefined) this.system.blood.value=data['system.blood.value'];},
  };
  return actor;
}
const claws = a => a.items.filter(i=>i.type==='weapon' && i.name==='Feral Claws');

test('Когти пропадают при смене Гангрела на Тореадора, прочее оружие и кровь сохраняются',async()=>{
 const a=makeActor(2);
 assert.equal(await useQuickPower(a,'protean:lvl2'),true);
 const bloodAfterCast=a.system.blood.value;
 a.items.push({id:'sword',name:'Sword',type:'weapon',system:{equipped:true,damage:'Str+2'}});
 await syncClanDisciplines(a,'Gangrel','Toreador');
 assert.equal(claws(a).length,0);
 assert.equal(a.items.some(i=>i.id==='sword'),true);
 assert.equal(a.system.blood.value,bloodAfterCast);
 assert.equal(quickActive(a,'protean:lvl2'),false);
 assert.equal(canQuickUse(a,'protean:lvl2'),false);
});

test('Старые когти без флага очищаются вместе с устаревшей активностью дисциплины',async()=>{
 const a=makeActor(2);
 a.items.push({id:'old',name:'Feral Claws',type:'weapon',system:{damage:'Str+1',damageType:'aggravated',equipped:true}});
 await a.setFlag('vtm-v20','activeDisciplines',['protean','potence']);
 await syncClanDisciplines(a,'Gangrel','Toreador');
 assert.equal(claws(a).length,0);
 assert.deepEqual(a.getFlag('vtm-v20','activeDisciplines'),['potence']);
});

test('Если Превращение 2 осталось изученным вне клана, активные когти не удаляются',async()=>{
 const a=makeActor(2);
 const old=a.items.find(i=>i.id==='protean');
 assert.equal(await useQuickPower(a,'protean:lvl2'),true);
 await syncClanDisciplines(a,'Toreador','Brujah');
 assert.equal(a.items.includes(old),true);
 assert.equal(claws(a).length,1);
 assert.equal(quickActive(a,'protean:lvl2'),true);
});

test('Понижение Превращения до 1 снимает когти, но не удаляет базовую дисциплину',async()=>{
 const a=makeActor(2);
 await useQuickPower(a,'protean:lvl2');
 a.items[0].system.level=1;
 assert.equal(quickActive(a,'protean:lvl2'),false);
 assert.equal(await cleanupUnavailableClaws(a),true);
 assert.equal(claws(a).length,0);
 assert.equal(a.items[0].system.level,1);
});

test('Ручные именные предметы не удаляются, когда они не являются временными когтями',async()=>{
 const a=makeActor(0);
 a.items.push({id:'custom',name:'Feral Claws',type:'weapon',system:{damage:'Str+5',damageType:'lethal'}});
 assert.equal(await cleanupUnavailableClaws(a),false);
 assert.equal(a.items.some(i=>i.id==='custom'),true);
});

test('Хук изменения и удаления дисциплины убирает старые когти автоматически',async()=>{
 const a=makeActor(2);
 await useQuickPower(a,'protean:lvl2');
 a.items[0].parent=a;
 a.items[0].system.level=1;
 for (const hook of callbacks.updateItem || []) await hook(a.items[0], {system:{level:1}}, {}, 'gm');
 assert.equal(claws(a).length,0);
 const b=makeActor(2);
 await useQuickPower(b,'protean:lvl2');
 const item=b.items.shift(); item.parent=b;
 for (const hook of callbacks.deleteItem || []) await hook(item,{},'gm');
 assert.equal(claws(b).length,0);
});
