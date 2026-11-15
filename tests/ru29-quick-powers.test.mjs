import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {canQuickUse,quickActive,useQuickPower,rating,quickPowers} from '../module/quick-combat-powers.mjs';
import {VTM} from '../module/config.mjs';
import {DISCIPLINES} from '../module/compendiums.mjs';
import {PATHS} from '../module/paths-data.mjs';
import {RITUALS} from '../module/rituals-data.mjs';
let messages=[];
globalThis.ui={notifications:{warn:(m)=>messages.push(`warn ${m}`),info:(m)=>messages.push(`info ${m}`)}};
globalThis.foundry={utils:{escapeHTML:x=>String(x)}};
globalThis.ChatMessage={getSpeaker:({actor})=>({alias:actor.name}),create:async m=>messages.push(m.content)};
globalThis.CONST={CHAT_MESSAGE_STYLES:{OTHER:0}};
globalThis.game={user:{id:'test'},vtm:{rollDicePool:async()=>({total:2,outcome:'success'})}};
function actor(disc='',level=0,{blood=7,limit=1,other=[]}={}) {
 const items=disc?[{name:disc,type:'discipline',system:{level}},...other]:other;
 const flags={};
 const a={name:'test',system:{blood:{value:blood},bloodPerTurn:limit},items, getFlag:(_,key)=>flags[key],async setFlag(_,key,v){flags[key]=v},async unsetFlag(_,key){delete flags[key]},async update(data){for(const [path,value] of Object.entries(data))if(path==='system.blood.value')this.system.blood.value=value;},
 async createEmbeddedDocuments(_,docs){for(const d of docs){const item={...d,delete:async()=>{items.splice(items.indexOf(item),1)}};items.push(item);}return docs;}};
 return a;
}
test('Unknown and non-learned powers never become buttons, even with matching clan',()=>{
 const a=actor('Превращение',1);a.system.clan='Gangrel';
 assert.equal(canQuickUse(a,'protean:lvl2'),false);
 assert.equal(canQuickUse(actor('Превращение',2),'protean:lvl2'),true);
 assert.equal(canQuickUse(actor('Затмение',3),'obtenebration:lvl3'),true);
 assert.equal(canQuickUse(actor('Затмение',2),'obtenebration:lvl3'),false);
 assert.equal(canQuickUse(actor('Демонион',3),'daimoinon:lvl3'),true);
 assert.equal(canQuickUse(actor('Могущество',5),'protean:lvl2'),false);
 assert.equal(canQuickUse(actor('Демонион',5),'doesnotexist:lvl2'),false);
 assert.equal(Object.keys(quickPowers).length,5);
});
test('Protean: toggle claws without duplicates or twice charging blood',async()=>{
 const a=actor('Превращение',2);messages=[];
 assert.equal(await useQuickPower(a,'protean:lvl2'),true);
 assert.equal(a.system.blood.value,6);assert.equal(quickActive(a,'protean:lvl2'),true);
 const claws=a.items.filter(i=>i.name==='Feral Claws');assert.equal(claws.length,1);
 assert.equal(claws[0].system.damage,'Str+1');assert.equal(claws[0].system.damageType,'aggravated');
 assert.equal(await useQuickPower(a,'protean:lvl2'),true);
 assert.equal(quickActive(a,'protean:lvl2'),false);assert.equal(a.system.blood.value,6);
 assert.equal(await useQuickPower(a,'protean:lvl2'),true);
 assert.equal(a.items.filter(i=>i.name==='Feral Claws').length,1);
});
test('No resources are consumed by unlearned powers or insufficient blood',async()=>{
 const a=actor('Превращение',1);assert.equal(await useQuickPower(a,'protean:lvl2'),false);assert.equal(a.system.blood.value,7);
 const b=actor('Превращение',2,{blood:0});assert.equal(await useQuickPower(b,'protean:lvl2'),false);assert.equal(b.items.length,1);
});
test('Serpentis attack appears only when switched on, and spend happens once',async()=>{
 const a=actor('Серпентис',2);assert.equal(await useQuickPower(a,'serpentis:lvl2'),true);
 assert.equal(quickActive(a,'serpentis:lvl2'),true);assert.equal(a.system.blood.value,6);
 assert.equal(await useQuickPower(a,'serpentis:lvl2'),true);assert.equal(quickActive(a,'serpentis:lvl2'),false);assert.equal(a.system.blood.value,6);
});
test('Arms of Abyss: cancel free; success records own strength and dexterity',async()=>{
 const a=actor('Затмение',3,{other:[{name:'Могущество',type:'discipline',system:{level:2}},{name:'Стремительность',type:'discipline',system:{level:1}}]});
 game.vtm.rollDicePool=async()=>null;
 assert.equal(await useQuickPower(a,'obtenebration:lvl3'),false);assert.equal(a.system.blood.value,7);
 game.vtm.rollDicePool=async()=>({total:2,outcome:'success'});
 assert.equal(await useQuickPower(a,'obtenebration:lvl3'),true);
 assert.deepEqual(a.getFlag('vtm-v20','onyxTentacles'),{count:2,strength:5,dexterity:4});assert.equal(a.system.blood.value,6);
 assert.equal(await useQuickPower(a,'obtenebration:lvl3'),true);assert.equal(a.getFlag('vtm-v20','onyxTentacles'),undefined);
});
test('V20 clan path and ritual integration without rewriting old systems',()=>{
 assert.deepEqual(VTM.clanDisciplines.Baali,['Daimoinon','Obfuscate','Presence']);
 assert.deepEqual(VTM.clanDisciplines.Nagaraja,['Auspex','Dominate','Necromancy']);
 assert.ok(PATHS.some(p=>p.name==='The Ash Path'));
 assert.ok(DISCIPLINES.some(d=>d.name==='Daimoinon'));
 assert.equal(DISCIPLINES.filter(d=>d.name==='Daimoinon').length,1);
 assert.equal(PATHS.filter(p=>p.name==='Tyranny of the Wyrm').length,1);
 assert.equal(RITUALS.filter(r=>r.system.ritualType==='abyssal').length,10);
 const source=fs.readFileSync(new URL('../module/vampire-sheet.mjs',import.meta.url),'utf8');
 assert.match(source,/ctx\.quickBattleActions/);assert.match(source,/onyxTentacles/);
 const template=fs.readFileSync(new URL('../templates/vampire-sheet.hbs',import.meta.url),'utf8');
 assert.match(template,/ru29-power-quickbar/);assert.match(template,/this\.quickBattleActions|quickBattleActions\.length/);
});
