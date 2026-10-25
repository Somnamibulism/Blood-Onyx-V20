import { test } from 'node:test';
import assert from 'node:assert/strict';
import { catalogs } from '../module/ru/content.mjs';
import { russianDocument } from '../module/ru/naming.mjs';
import { preparePower, canUsePower, powerUsesRoll, powerRequiresTarget } from '../module/ru/powers.mjs';
import { powerRollMetrics, resistedOutcome, powerAuditData } from '../module/ru/power-report.mjs';
import { VTM } from '../module/config.mjs';
globalThis.game={settings:{get:()=> 'raw'},combat:null};
function actor({name='Соня',type='vampire',gen=13,wp=6,maxWp=7,wits=3,perception=2,alertness=4,stamina=3,courage=4,selfControl=3,humanity=7}={}){
 return {id:name,name,type,system:{generation:gen,willpower:{value:wp,max:maxWp},humanity,
 attributes:{strength:2,dexterity:2,stamina,wits,perception,charisma:3,manipulation:3},
 abilities:{alertness,intimidation:3,subterfuge:3,empathy:3},virtues:{selfControl,courage}},items:[],getFlag:()=>false};
}
function disc(name){const d=russianDocument(catalogs.DISCIPLINES.find(x=>x.name===name));d.system.level=5;return d;}
const cas=actor({name:'Астарион',gen:12,maxWp:8});
const target=actor({name:'Цель',wp:5,wits:4,alertness:3,perception:3,selfControl:4,courage:2,maxWp:6});
test('Подсчёт успехов: 10 на специализации, единицы и итог',()=>{
 const m=powerRollMetrics({total:2,outcome:'success',dice:[{value:10,status:'crit'},{value:7,status:'success'},{value:1,status:'botch'}]});
 assert.equal(m.successfulDice,2);assert.equal(m.extraSpecialization,1);assert.equal(m.ones,1);assert.equal(m.net,2);
});
test('Доминирование уровень I: сложность по текущей воле цели',()=>{
 const p=preparePower(cas,disc('Dominate'),'lvl1',target);
 assert.equal(p.power.difficulty,5);assert.match(p.audit.difficultyBasis,/5/);
});
test('Одержимость: встречный бросок Воли сложности 7',()=>{
 const mortal=actor({type:'mortal'});
 const p=preparePower(cas,disc('Dominate'),'lvl5',mortal);
 assert.equal(p.power.difficulty,7);
 assert.deepEqual([p.audit.resistance.primary,p.audit.resistance.difficulty],['willpower',7]);
});
test('Химерия V: бросок действительно существует, цель обязательна',()=>{
 const d=disc('Chimerstry');d.system.powers.lvl5.primary='';
 assert.equal(powerUsesRoll(d,'lvl5'),true);
 assert.match(preparePower(cas,d,'lvl5').error,/цель/);
 const p=preparePower(cas,d,'lvl5',target);
 assert.equal(p.power.primary,'attributes.manipulation');
 assert.equal(p.power.difficulty,7);
});
test('Затемнение IV использует сообразительность и бдительность цели',()=>{
 const p=preparePower(cas,disc('Obfuscate'),'lvl4',target);
 assert.equal(p.power.difficulty,7);assert.match(p.audit.difficultyBasis,/Бдительность/);
});
test('Зов Дагона: обе стороны используют постоянную волю противника',()=>{
 const p=preparePower(cas,disc('Quietus'),'lvl3',target);
 assert.equal(powerUsesRoll(disc('Quietus'),'lvl3'),true);
 assert.equal(p.power.primary,'attributes.stamina');
 assert.equal(p.power.difficulty,6);
 assert.equal(p.audit.resistance.difficulty,8);
});
test('Усмирение Зверя: 7, порог равен постоянной Воле цели',()=>{
 const p=preparePower(cas,disc('Animalism'),'lvl3',target);
 assert.equal(p.power.difficulty,7);
 assert.equal(p.audit.threshold,6);
});
test('Прорицание I не требует броска и не создаёт фиктивный успех',()=>assert.equal(powerUsesRoll(disc('Auspex'),'lvl1'),false));
test('Сопротивление не может добавить отрицательный урон',()=>{
 assert.deepEqual(resistedOutcome({total:2},{total:5}),{net:0,status:'resisted'});
 assert.deepEqual(resistedOutcome({total:5},{total:2}),{net:3,status:'success'});
});
test('Если атакующий не преуспел, журнал не пишет ожидание сопротивления',()=>{
 const p=preparePower(cas,disc('Quietus'),'lvl3',target);
 const audit=powerAuditData({prepared:p,attack:{outcome:'failure',total:0,dice:[]},resistancePending:false});
 assert.match(audit.result,/провалена/);
});
test('Если сложность вручную изменена, журнал отображает фактическое значение',()=>{
 const p=preparePower(cas,disc('Dominate'),'lvl1',target);
 const audit=powerAuditData({prepared:p,attack:{difficulty:8,total:1,outcome:'success',dice:[{value:9,status:'success'}]}});
 assert.equal(audit.difficulty,8);
});
test('Сила без купленных точек недоступна',()=>{const d=disc('Dominate');d.system.level=0;assert.equal(canUsePower(cas,d,'lvl1'),false);});
