import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VTM } from '../module/config.mjs';
import { CLAN_WEAKNESSES } from '../module/clan-weaknesses.mjs';
import { DISCIPLINES } from '../module/compendiums.mjs';
import { PATHS } from '../module/paths-data.mjs';
import { displayName, canonicalName, russianDocument } from '../module/ru/naming.mjs';
import { canUsePower, preparePower } from '../module/ru/powers.mjs';
import { clanDocuments } from '../module/ru/content.mjs';

const koldunicNames = [
  'Way of Earth (Koldunic)', 'Way of Wind (Koldunic)', 'Way of Water (Koldunic)',
  'Way of Fire (Koldunic)', 'Way of Spirit (Koldunic)', 'Way of Sorrow (Koldunic)',
];
const actor = (sorcery=0) => ({
  id:'a', name:'Кольдун', type:'vampire',
  items: sorcery ? [{type:'discipline',name:'Колдовство колдунов',system:{level:sorcery}}] : [],
  system: {willpower:{max:7,value:4}},
});
const path=(name,level=5)=>({...PATHS.find(i=>i.name===name),parent:null,system:{...PATHS.find(i=>i.name===name).system,level}});
test('Старые Цимисхи отдельны, обычные Цимисхи не затронуты',()=>{
  assert.ok(VTM.clans.includes('Old Clan Tzimisce'));
  assert.deepEqual(VTM.clanDisciplines['Old Clan Tzimisce'], ['Animalism','Auspex','Dominate']);
  assert.deepEqual(VTM.clanDisciplines.Tzimisce, ['Animalism','Auspex','Vicissitude']);
  assert.equal(displayName('Old Clan Tzimisce'),'Старые Цимисхи');
  assert.equal(canonicalName('Старые Цимисхи'),'Old Clan Tzimisce');
  assert.ok(clanDocuments.some(c=>c.name==='Old Clan Tzimisce'));
  assert.match(CLAN_WEAKNESSES['Old Clan Tzimisce'],/земл/);
});
test('Колдовство доступно вручную и не выдаётся клану автоматически',()=>{
  const d=DISCIPLINES.find(x=>x.name==='Koldunic Sorcery');
  assert.ok(d);
  assert.equal(VTM.clanDisciplines['Old Clan Tzimisce'].includes(d.name),false);
  assert.equal(d.type,'discipline');
  assert.equal(d.system.level,0);
  assert.equal(displayName(d.name),'Колдовство колдунов');
  assert.equal(canonicalName('Колдовство колдунов'), d.name);
});
test('Шесть колдовских путей V20 с 30 русскими описаниями и 5 уровнями',()=>{
  const ways=PATHS.filter(x=>x.system.category==='koldunic');
  assert.deepEqual(ways.map(x=>x.name),koldunicNames);
  for (const w of ways) {
    const localized=russianDocument(w);
    assert.match(localized.name,/Колдовство/);
    for(let lvl=1;lvl<=5;lvl++) {
      const p=w.system.powers[`lvl${lvl}`];
      assert.ok(p.name && p.desc,w.name+' '+lvl);
      assert.match(p.desc,/[А-Яа-яЁё]/);
      assert.equal(p.primary,'willpower');
      assert.equal(p.cost,'1 blood');
      // Tempest shares the Russian title 'Буря' with an older spell (Storm).
      if (p.name === 'Tempest') assert.equal(localized.system.powers[`lvl${lvl}`].name,'Буря');
      else assert.equal(canonicalName(localized.system.powers[`lvl${lvl}`].name),p.name);
    }
  }
});
test('Бросок пути запрещён без отдельно изученного Колдовства и уровня',()=>{
  const w=path(koldunicNames[0],4);
  assert.equal(canUsePower(actor(),w,'lvl1'),false);
  assert.equal(canUsePower(actor(2),w,'lvl3'),false);
  assert.equal(canUsePower(actor(2),w,'lvl2'),true);
  assert.equal(canUsePower(actor(5),path(koldunicNames[0],1),'lvl2'),false);
});
test('Сложность зависит от рейтинга пути, а не выбранной силы',()=>{
  const w=path(koldunicNames[1],4);
  const a=actor(4);
  const p=preparePower(a,w,'lvl1');
  assert.equal(p.power.difficulty,7);
  assert.equal(p.power.primary,'willpower');
  assert.equal(p.power.cost,'1 blood');
  assert.match(p.audit.difficultyBasis,/3 \+ рейтинг/);
  assert.match(p.audit.note,/Восточной Европы/);
});
test('Другие пути и дисциплины используют прежний порядок проверки',()=>{
  const normal={...PATHS.find(x=>x.name==='Path of Blood'),system:{...PATHS.find(x=>x.name==='Path of Blood').system,level:2}};
  assert.equal(canUsePower(actor(),normal,'lvl2'),true);
  assert.equal(preparePower(actor(),normal,'lvl2').power.cost,'1 blood');
});
