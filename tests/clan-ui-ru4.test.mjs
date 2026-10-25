import {test} from 'node:test';
import assert from 'node:assert/strict';
const hooks = {};
globalThis.Hooks = {on:(name,fn)=>{(hooks[name] ||= []).push(fn);return hooks[name].length;}, off:()=>{}};
const notices=[];
globalThis.ui = {notifications:{warn:s=>notices.push(s),info:s=>notices.push(s)}};
globalThis.game = {
  user:{id:'gm'},items:[],packs:new Map(),i18n:{localize:s=>s},
};
globalThis.foundry = {utils:{deepClone:structuredClone}};
const {ChargenWizard} = await import('../module/chargen.mjs');
const {addClanDisciplines,syncClanDisciplines} = await import('../module/clan-auto.mjs');
const {VTM} = await import('../module/config.mjs');

function wizard() {
 const sheet = {render:()=>{},_closeChargen:()=>{}};
 const actor={uuid:'Actor.test',name:'Соня',items:[],update:async()=>{},createEmbeddedDocuments:async()=>{}};
 return new ChargenWizard(actor,sheet);
}

test('Все три дисциплины Тореадор подставляются без потраченных точек',()=>{
 const w=wizard(); w._setClan('Toreador');
 assert.deepEqual(w.d.disc.map(i=>[i.name,i.dots]),[['Auspex',0],['Celerity',0],['Presence',0]]);
 assert.equal(w._itemPool('disc'),3);
 assert.deepEqual(w.getData().clanChoices.find(x=>x.value==='Toreador'),{value:'Toreador',label:'Тореадор'});
 w.destroy();
});

test('Для всех 14 кланов дисциплины заранее загружаются из карты V20',()=>{
 for(const clan of VTM.clans.filter(x=>!['Caitiff','Pander'].includes(x))){
  const w=wizard();w._setClan(clan);
  assert.deepEqual(w.d.disc.map(x=>x.name),VTM.clanDisciplines[clan]);
  w.destroy();
 }
});

test('У каитифа нет обязательного набора, но доступен ручной выбор',()=>{
 const w=wizard(); w._setClan('Caitiff');assert.equal(w.d.disc.length,0);
 w.step=3;w._addFromCatalog('discipline','Animalism');
 assert.equal(w.d.disc.length,1);assert.equal(w.d.disc[0].itemData.type,'discipline');
 const options=w.getData().disciplineCatalog;
 assert.equal(options.find(x=>x.name==='Animalism').selected,true);
 w.destroy();
});

test('Смена клана удаляет старые клановые дисциплины, даже с точками',()=>{
 const w=wizard();w._setClan('Toreador');w.d.disc[0].dots=2;
 w._setClan('Brujah');
 assert.equal(w.d.disc.some(x=>x.name==='Auspex'),false);
 assert.equal(w.d.disc.some(x=>x.name==='Presence'),true);
 assert.deepEqual(w.d.disc.map(x=>x.name),['Celerity','Presence','Potence']);
 assert.equal(w.d.disc.find(x=>x.name==='Celerity').dots,0);
 w.destroy();
});

test('Общая дисциплина и вручную выбранная внеклановая сохраняются, freebies не смещаются',()=>{
 const w=wizard();w._setClan('Toreador');
 w.d.disc.find(x=>x.name==='Celerity').dots=2;
 w.d.fb['disc.1']=1;
 w.step=3;w._addFromCatalog('discipline','Animalism');
 const manual=w.d.disc.find(x=>x.name==='Animalism');
 assert.ok(manual && !manual.autoClan);
 w._setClan('Brujah');
 assert.equal(w.d.disc.find(x=>x.name==='Celerity').dots,2);
 assert.ok(w.d.disc.includes(manual));
 assert.equal(w.d.fb['disc.0'],1);
 assert.equal(w.d.fb['disc.1'],undefined);
 w.destroy();
});
test('Поиск и выбор всех 14 фактов биографии и 165 достоинств/недостатков',()=>{
 const w=wizard();w._setClan('Toreador');w.step=3;
 assert.equal(w.getData().backgroundCatalog.length,14);
 w._addFromCatalog('background','Allies');
 assert.equal(w.d.bg[0].itemData.type,'background');
 w.step=4;w.d.useMeritsFlaws=true;
 const data=w.getData();assert.equal(data.meritCatalog.length,63);assert.equal(data.flawCatalog.length,102);
 w._addFromCatalog('flaw','Short');
 assert.equal(w.d.meritsFlaws[0].cost,-1);
 w.destroy();
});

test('Воля в V20 ограничена 10 и повышение расходует свободные очки',()=>{
 const w=wizard();w.d.virtues.courage=5;
 w.d.fb.willpower=5;
 assert.equal(w._freebieData().wp.total,10);
 assert.equal(w._canBumpFb('willpower'),false);
 assert.equal(w._freebiesLeft(),10);
 w.destroy();
});

test('Обычный лист получает дисциплины и не дублирует существующие',async()=>{
 const items=[{name:'Присутствие',type:'discipline',system:{level:3}}];
 const actor={type:'vampire',uuid:'Actor.toreador',items,
  createEmbeddedDocuments:async(_type,data)=>{items.push(...data);return data;}};
 const names=await addClanDisciplines(actor,'Тореадор');
 assert.deepEqual(names,['Auspex','Celerity']);
 assert.equal(items.length,3);
 assert.equal(items[0].system.level,3);
 assert.equal((await addClanDisciplines(actor,'Toreador')).length,0);
});
test('Салюбри: автоподстановка Обеа и отображение всех уровней в создании',()=>{
 const w=wizard();w._setClan('Салюбри');
 assert.deepEqual(w.d.disc.map(x=>x.name),['Auspex','Fortitude','Obeah']);
 w.step=3;const d=w.getData();
 assert.equal(d.salubriCreationHint,true);
 assert.equal(d.discEntries.find(x=>x.name==='Obeah').guides.length,0);
 w.d.disc.find(x=>x.name==='Obeah').dots=2;
 assert.equal(w.getData().discEntries.find(x=>x.name==='Obeah').guides.length,2);
 assert.equal(d.disciplineCatalog.find(x=>x.name==='Obeah').selected,true);
 w.destroy();
});
test('Поколение 5 из факта биографии даёт 8-е поколение, ручное поле не перебивает его',()=>{
 const w=wizard();w._setClan('Salubri');
 w.step=3;w._addFromCatalog('background','Generation');
 w.d.bg[0].dots=5;w.step=4;
 assert.equal(w.getData().generationFromBackground,true);
 assert.equal(w.d.generation,8);
 assert.equal(w.getData().bloodPool,15);
 w.d.bg=[];w.getData();assert.equal(w.d.generation,13);
 w.destroy();
});

test('Завершение создания сохраняет три дисциплины Салюбри, даже если часть из них нулевая',async()=>{
 const created=[];
 const actor={uuid:'Actor.test',name:'Салюбри',items:[],update:async()=>{},
  createEmbeddedDocuments:async(_type,data)=>{created.push(...data);return data;}};
 const w=new ChargenWizard(actor,{render:()=>{},_closeChargen:()=>{}});
 w._setClan('Salubri');
 w.d.disc[2].dots=3;
 await w._finish();
 const disciplines=created.filter(x=>x.type==='discipline');
 assert.equal(disciplines.length,3);
 assert.deepEqual(disciplines.map(x=>x.system.level),[0,0,3]);
 w.destroy();
});

test('Готовый лист удаляет старые клановые дисциплины, но сохраняет общие и авторские',async()=>{
 const items=[
  {id:'a',name:'Прорицание',type:'discipline',system:{level:4}},
  {id:'c',name:'Стремительность',type:'discipline',system:{level:2}},
  {id:'p',name:'Присутствие',type:'discipline',system:{level:1}},
  {id:'o',name:'Анимализм',type:'discipline',system:{level:3}},
 ];
 const deleted=[];
 const a={type:'vampire',uuid:'Actor.switch',items,
  deleteEmbeddedDocuments:async(_,ids)=>{deleted.push(...ids);for(const id of ids){const pos=items.findIndex(x=>x.id===id);if(pos>=0)items.splice(pos,1);}},
  createEmbeddedDocuments:async(_,data)=>{items.push(...data);return data;}};
 await syncClanDisciplines(a,'Toreador','Brujah');
 assert.deepEqual(deleted.sort(),['a']);
 assert.equal(items.find(x=>x.name==='Стремительность').system.level,2);
 assert.equal(items.find(x=>x.name==='Присутствие').system.level,1);
 assert.equal(items.find(x=>x.name==='Анимализм').system.level,3);
 assert.ok(items.find(x=>x.name==='Potence'));
});
