import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {computeSoakPool,finalDamageAfterSoak,applyHealthDamage} from '../module/combat.mjs';
import {effectiveTraitValue,potenceAutoSuccesses,disciplineLevel} from '../module/discipline-effects.mjs';
import {preparePower, canUsePower} from '../module/ru/powers.mjs';
import {catalogs,clanDocuments} from '../module/ru/content.mjs';
import {canonicalName,displayName,russianDocument} from '../module/ru/naming.mjs';
import {VTM} from '../module/config.mjs';
import {translateText} from '../module/ru/lexicon.mjs';
import {trackValues,countDamage} from '../module/health-track.mjs';

globalThis.game={settings:{get:()=> 'raw'},modules:new Map(),combat:null};
function actor({type='vampire',sta=3,fort=0,armor=0,flags={},gen=13,wp=4,items=[]}={}) {
 const sys={attributes:{strength:2,dexterity:3,stamina:sta,wits:3,perception:3},virtues:{selfControl:3,courage:3},willpower:{value:wp,max:7},generation:gen,humanity:6,
 health:{extra:[],levels:{bruised:0,hurt:0,injured:0,wounded:0,mauled:0,crippled:0,incapacitated:0}}};
 return {type,system:sys,items:[...(fort?[{type:'discipline',name:'Стойкость',system:{level:fort}}]:[]),...(armor?[{type:'armor',name:'Броня',system:{equipped:true,rating:armor}}]:[]),...items],getFlag:(_,key)=>flags[key],async update(changes){for(const[path,value]of Object.entries(changes)){const parts=path.split('.');let t=this;for(const key of parts.slice(0,-1))t=t[key];t[parts.at(-1)]=value;}}};
}
const soakCases=[
 ['вампир, ударный',{},'bashing',{},3,true],
 ['вампир, летальный',{},'lethal',{},3,true],
 ['вампир, аггравированный',{},'aggravated',{},0,false],
 ['вампир, когти, броня без Стойкости',{armor:3},'aggravated',{},0,false],
 ['вампир, огонь',{armor:3,fort:2},'aggravated',{fireOrSunlight:true},2,true],
 ['смертный, ударный',{type:'mortal'},'bashing',{},3,true],
 ['смертный, летальный',{type:'mortal'},'lethal',{},0,false],
 ['смертный, летальный, броня',{type:'mortal',armor:3},'lethal',{},3,true],
 ['смертный, аггравированный',{type:'mortal'},'aggravated',{},0,false],
 ['смертный, огонь, броня',{type:'mortal',armor:4},'aggravated',{fireOrSunlight:true},0,false],
 ['нулевая Выносливость',{sta:0},'lethal',{},0,false],
 ['обход брони',{armor:4},'lethal',{bypassArmor:true},3,true],
 ['гуль со Стойкостью',{type:'mortal',fort:2},'lethal',{},2,true],
 ['Кожа гадюки, когти без Стойкости',{flags:{skinOfTheAdder:true}},'aggravated',{},0,false],
 ['Кожа гадюки, огонь',{flags:{skinOfTheAdder:true},fort:2},'aggravated',{fireOrSunlight:true},2,true],
 ['Кожа гадюки, иная энергия без Стойкости',{flags:{skinOfTheAdder:true}},'aggravated',{aggravatedSource:'magic'},0,false]
];
for(const[name,opts,type,extra,pool,canSoak]of soakCases)test(`Поглощение: ${name}`,()=>{const result=computeSoakPool(actor(opts),{dmgType:type,...extra});assert.equal(result.pool,pool);assert.equal(result.canSoak,canSoak);});
for(let damage=0;damage<=9;damage++)test(`Ударный вампиру: ${damage} → ${Math.floor(damage/2)}`,()=>assert.equal(finalDamageAfterSoak(actor(),damage,'bashing'),Math.floor(damage/2)));
for(const type of ['lethal','aggravated'])test(`${type} не делится пополам`,()=>assert.equal(finalDamageAfterSoak(actor(),5,type),5));
test('Смертный получает весь ударный урон',()=>assert.equal(finalDamageAfterSoak(actor({type:'mortal'}),5,'bashing'),5));
test('Отрицательный урон не лечит',()=>assert.equal(finalDamageAfterSoak(actor(),-3,'bashing'),0));
test('Русские названия дисциплин работают в расчетах',()=>{const a=actor({items:[{name:'Могущество',type:'discipline',system:{level:3}}]});assert.equal(disciplineLevel(a,'Potence'),3);assert.equal(effectiveTraitValue(a,'attributes.strength'),5);});
test('Активное Могущество не дает одновременно кубики и успехи',()=>{const a=actor({items:[{name:'Могущество',type:'discipline',system:{level:3}}],flags:{activeDisciplines:['potence']}});assert.equal(effectiveTraitValue(a,'attributes.strength'),2);assert.equal(potenceAutoSuccesses(a),3);});
test('Стремительность уменьшает пассивный бонус на купленные действия',()=>{const a=actor({items:[{name:'Стремительность',type:'discipline',system:{level:4}}],flags:{celerityRawActions:2}});assert.equal(effectiveTraitValue(a,'attributes.dexterity'),5);});
test('Нельзя получить отрицательную Ловкость от Стремительности',()=>{const a=actor({items:[{name:'Стремительность',type:'discipline',system:{level:2}}],flags:{celerityRawActions:4}});assert.equal(effectiveTraitValue(a,'attributes.dexterity'),3);});
const disc=(name,level=5)=>{const item=russianDocument(catalogs.DISCIPLINES.find(d=>d.name===name));item.system.level=level;return item;};
test('Доминирование требует цель',()=>assert.match(preparePower(actor(),disc('Dominate'),'lvl1').error,/цель/));
test('Доминирование не действует на старшее поколение',()=>assert.match(preparePower(actor({gen:13}),disc('Dominate'),'lvl1',actor({gen:12})).error,/поколения/));
test('Доминирование использует текущую Силу воли цели',()=>assert.equal(preparePower(actor({gen:12}),disc('Dominate'),'lvl1',actor({gen:13,wp:4})).power.difficulty,4));
test('Одержимость не принимает тело вампира',()=>assert.match(preparePower(actor({gen:10}),disc('Dominate'),'lvl5',actor({gen:13})).error,/смертного/));
test('Телепатия на вампира требует Силу воли',()=>assert.equal(preparePower(actor(),disc('Auspex'),'lvl4',actor()).power.cost,'1 Willpower'));
test('Телепатия на смертного не добавляет расход',()=>assert.equal(preparePower(actor(),disc('Auspex'),'lvl4',actor({type:'mortal'})).power.cost,''));
test('Страсть использует Человечность цели',()=>assert.equal(preparePower(actor(),disc('Dementation'),'lvl1',actor()).power.difficulty,6));
test('Ужасающий взгляд использует Сообразительность + Смелость',()=>assert.equal(preparePower(actor(),disc('Presence'),'lvl2',actor()).power.difficulty,6));
test('Поглощение и запись здоровья не требуют отдельного ручного броска',async()=>{const a=actor();await applyHealthDamage(a,3,'bashing');assert.equal(countDamage(a.system).bash,3);await applyHealthDamage(a,2,'aggravated');assert.deepEqual(trackValues(a.system),[3,3,1,1,1,0,0]);});
test('Переполнение ударного переводит ячейку в летальный урон',async()=>{const a=actor();await applyHealthDamage(a,7,'bashing');await applyHealthDamage(a,1,'bashing');assert.deepEqual(countDamage(a.system),{bash:6,leth:1,agg:0});});
for(const[name,group]of Object.entries(catalogs))test(`Справочник ${name}: русские описания и допустимые метаданные`,()=>{
 for(const it of group){assert.match(it.system.description,/[А-Яа-яЁё]/,it.name);const data=russianDocument(it);assert.equal(canonicalName(data.name),it.name,it.name);for(const p of Object.values(it.system.powers||{})){assert.ok(p.difficulty>=2&&p.difficulty<=10,it.name);if(p.name)assert.match(p.desc,/[А-Яа-яЁё]/,p.name);}}
});
test('Полный набор: 13 кланов, салюбри, каитифы и пандеры',()=>{assert.equal(clanDocuments.length,16);for(const c of clanDocuments)for(const d of c.system.disciplines)assert.ok(catalogs.DISCIPLINES.some(it=>it.name===d));});
test('В ванильном наборе нет авторского магического оружия',()=>assert.ok(!catalogs.WEAPONS.some(it=>it.name==='Blessed Macuahuitl')));
test('Заклинание постоянного предмета не использует стоимость Химерии',()=>{const p=catalogs.PATHS.find(p=>p.name==='The Path of Conjuring').system.powers;assert.equal(p.lvl2.cost,'3 blood');assert.equal(p.lvl3.cost,'5 blood');assert.equal(p.lvl5.cost,'10 blood');});
test('Идентификаторы и формулы не переводятся',()=>{const src=catalogs.WEAPONS[0];const ru=russianDocument(src);assert.equal(ru.type,src.type);assert.equal(ru.system.damage,src.system.damage);assert.equal(src.name,'Small Club');});
test('Точная локализация результата не превращает неудачу в название недостатка',()=>assert.equal(translateText('Failure'),'Неудача'));
test('Манифест: все заявленные файлы существуют',()=>{const root=new URL('../',import.meta.url);const manifest=JSON.parse(fs.readFileSync(new URL('system.json',root)));for(const rel of [...manifest.esmodules,...manifest.styles,...manifest.languages.map(l=>l.path),...manifest.packs.map(p=>p.path),...manifest.packs.map(p=>p.banner.replace('systems/vtm-v20/',''))])assert.ok(fs.existsSync(new URL(rel,root)),rel);assert.equal(manifest.id,'vtm-v20');assert.equal(manifest.compatibility.minimum,'13');assert.ok(!manifest.download);});
test('Поколения 4–13 соответствуют базовой таблице',()=>assert.deepEqual(Array.from({length:10},(_,n)=>VTM.generationTable[n+4].maxBlood),[50,40,30,20,15,14,13,12,11,10]));
test('Автоматический огонь: фиксированные +10 кубиков, +2 сложности',async()=>{const{fireModeModifiers}=await import('../module/combat.mjs');assert.deepEqual(fireModeModifiers('auto'),{dice:10,difficulty:2});assert.deepEqual(fireModeModifiers('burst'),{dice:2,difficulty:1});});
test('Инициатива включает не потраченные точки Стремительности ровно один раз',async()=>{
 const callbacks={};globalThis.Hooks={on:(event,fn)=>(callbacks[event]??=[]).push(fn)};
 game.user={isGM:true,id:'gm'};game.users={activeGM:{id:'gm'}};
 const{registerInitiativeHooks}=await import('../module/initiative.mjs');registerInitiativeHooks();
 const a=actor({items:[{type:'discipline',name:'Стремительность',system:{level:4}}],flags:{celerityRawActions:1}});a.system.woundPenalty=-1;
 const updates=[];const cb={actor:a,getFlag:()=>false,update:data=>updates.push(data)};
 callbacks.updateCombatant[0](cb,{initiative:12});assert.equal(updates[0].initiative,14);assert.equal(updates[0]['flags.vtm-v20.initRating'],9);
 game.user.isGM=false;callbacks.updateCombatant[0](cb,{initiative:12});assert.equal(updates.length,1);
});

test('0 точек скрывает и блокирует все силы дисциплины',()=>{
 const a=actor();const item=disc('Auspex',0);
 assert.equal(canUsePower(a,item,'lvl1'),false);
 assert.match(preparePower(a,item,'lvl1').error,/не изучена/);
});
test('Только купленные уровни позволяют пользоваться способностями',()=>{
 const a=actor();const item=disc('Auspex',2);
 assert.equal(canUsePower(a,item,'lvl1'),true);
 assert.equal(canUsePower(a,item,'lvl2'),true);
 assert.equal(canUsePower(a,item,'lvl3'),false);
 assert.equal(canUsePower(a,item,'lvl5'),false);
 assert.ok(preparePower(a,item,'lvl3').error);
 assert.equal(canUsePower(a,item,'lvl0'),false);
 assert.equal(canUsePower(a,item,'lvlNaN'),false);
});
