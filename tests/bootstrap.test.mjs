import {test} from 'node:test';
import assert from 'node:assert/strict';
const callbacks={};
globalThis.Hooks={on:(name,fn)=>(callbacks[name]??=[]).push(fn),once:(name,fn)=>(callbacks[name]??=[]).push(fn)};
class Base{};class Field{constructor(...args){this.args=args;}}
globalThis.foundry={utils:{deepClone:structuredClone},data:{fields:new Proxy({},{get:()=>Field})},abstract:{TypeDataModel:Base},applications:{api:{ApplicationV2:Base,HandlebarsApplicationMixin:x=>x},sheets:{ActorSheetV2:Base,ItemSheetV2:Base}}};
const settings=new Map();
globalThis.game={user:{id:'gm',isGM:true},users:{activeGM:{id:'gm'}},settings:{register:(ns,key,data)=>settings.set(key,data),registerMenu:()=>{},get:(ns,key)=>settings.get(key)?.default},modules:new Map()};
globalThis.ui={notifications:{info:()=>{},warn:()=>{},error:()=>{}}};
globalThis.document={body:{classList:{toggle:()=>{}}}};
globalThis.CONFIG={Actor:{dataModels:{}},Item:{dataModels:{}},Combat:{},statusEffects:[]};
globalThis.Actors={registerSheet:()=>{}};globalThis.Items={registerSheet:()=>{}};
globalThis.Handlebars={registerHelper:()=>{},SafeString:class{}};
globalThis.loadTemplates=()=>{};
await import('../vtm-v20.mjs');
test('Точка входа импортируется с заглушками Foundry API',()=>assert.ok(callbacks.init?.length>=2));
test('Начальная регистрация объявляет все модели и базовую Стремительность',async()=>{for(const fn of [...callbacks.init])await fn();assert.equal(settings.get('celerityMode').default,'raw');assert.equal(Object.keys(CONFIG.Item.dataModels).length,10);assert.ok(CONFIG.Actor.dataModels.vampire);});
test('В модели вампира есть сохраняемое поле секты',()=>assert.ok(CONFIG.Actor.dataModels.vampire.defineSchema().sect));
test('Русский и английский формат стоимости читаются одинаково',async()=>{const{parseCost}=await import('../module/item-sheet.mjs');assert.deepEqual(parseCost('2 blood + 1 WP'),{blood:2,wp:1,variable:false});assert.deepEqual(parseCost('2 крови + 1 СВ'),{blood:2,wp:1,variable:false});});
test('Сохранение русского названия сохраняет ключ распознавания дисциплины',async()=>{
 const changes={name:'Potence'};for(const fn of callbacks.preUpdateItem)fn({type:'discipline',system:{},parent:null},changes,{},'gm');assert.equal(changes.name,'Мощь');
});
test('Локализация не меняет идентификаторы и пользовательскую биографию',async()=>{
 const{translateRoot}=await import('../module/ru/ui.mjs');
 const nodes=[{nodeValue:'Strength',parentElement:{closest:()=>false}},{nodeValue:'Strength is my chosen name',parentElement:{closest:()=>true}},{nodeValue:'Patrick Smith',parentElement:{closest:()=>false}}];
 globalThis.NodeFilter={SHOW_TEXT:4};document.createTreeWalker=()=>{let i=0;return{nextNode:()=>nodes[i++]||null}};
 const root={querySelectorAll:()=>[]};translateRoot(root,{actorName:'Patrick Smith'});
 assert.equal(nodes[0].nodeValue,'Сила');assert.equal(nodes[1].nodeValue,'Strength is my chosen name');assert.equal(nodes[2].nodeValue,'Patrick Smith');
});
test('Первоначальная загрузка наполняет справочники V20 и безопасно восстанавливает отсутствующие записи', async()=>{
 const saved = new Map(); const folders = new Map(); const wrote = new Map();
 game.settings.set=async(ns,key,value)=>settings.set(key,{default:value});
 const names=['disciplines','backgrounds','weapons','armor','merits','flaws','paths','rituals','equipment','containers','v5lore','clans'];
 game.packs=new Map(names.map(name=>[`vtm-v20.${name}`,{
   collection:`vtm-v20.${name}`,metadata:{name},folders:{size:0,contents:[]},
   configure:async()=>{},getIndex:async()=>({size:(saved.get(name)||[]).length,contents:(saved.get(name)||[]).map((i,n)=>({_id:String(n),name:i.name}))}),
 }]));
 globalThis.Folder={createDocuments:async(data,{pack})=>data.map((it,n)=>{const doc={...it,id:`${pack}-folder-${folders.size}-${n}`};folders.set(doc.id,doc);return doc;}),deleteDocuments:async()=>{}};
 globalThis.Item={createDocuments:async(data,{pack})=>{
   const key=pack.split('.').pop();saved.set(key,[...(saved.get(key)||[]),...data]);
   wrote.set(key,(wrote.get(key)||0)+data.length);return data;
 },deleteDocuments:async()=>{throw Error('destructive deletion not allowed')}};
 const {populateCompendiums}=await import('../module/compendiums.mjs');
 await populateCompendiums({force:true});
 assert.equal(saved.size,12);
 assert.equal([...saved.values()].flat().length,418);
 assert.ok(saved.get('disciplines').some(it=>it.name==='Стойкость'));
 for(const it of [...saved.values()].flat()) if(it.folder) assert.ok(folders.has(it.folder));
 assert.ok([...folders.values()].some(f=>f.name==='Дробящее оружие'));
 assert.equal(settings.get('compendiumVersion').default,1300);
 const count=[...saved.values()].flat().length;
 await populateCompendiums();
 assert.equal([...saved.values()].flat().length,count,'second run cannot duplicate entries');
});

test('Когда Dice So Nice включен, система использует его 3D-кубики вместо запасного режима', async()=>{
 const {showDice}=await import('../module/dice.mjs');
 const roll={dice:[{faces:10,results:[{result:7}]}]};let called=0;
 game.dice3d={showForRoll:async(input,user,publicRoll)=>{called++;assert.equal(input,roll);assert.equal(publicRoll,true);}};
 await showDice(roll);
 assert.equal(called,1);
 delete game.dice3d;
});
