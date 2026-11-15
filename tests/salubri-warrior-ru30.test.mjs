import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { VTM } from '../module/config.mjs';
import { DISCIPLINES } from '../module/compendiums.mjs';
import { clanDocuments } from '../module/ru/content.mjs';
import { displayName, canonicalName, russianDocument } from '../module/ru/naming.mjs';
import { disciplineGuide } from '../module/ru/discipline-guides.mjs';
import { weaknesses } from '../module/ru/extra.mjs';

test('Салюбри-воины существуют как отдельный вариант, целители не затронуты', () => {
  assert.ok(VTM.clans.includes('Salubri Antitribu'));
  assert.deepEqual(VTM.clanDisciplines['Salubri Antitribu'],['Auspex','Fortitude','Valeren']);
  assert.deepEqual(VTM.clanDisciplines.Salubri,['Auspex','Fortitude','Obeah']);
  assert.equal(displayName('Salubri Antitribu'),'Салюбри-воины');
  assert.equal(canonicalName('Салюбри-воины'),'Salubri Antitribu');
  assert.ok(clanDocuments.some(c=>c.name==='Salubri Antitribu'));
  assert.match(weaknesses['Salubri Antitribu'],/10–12/);
  assert.match(weaknesses['Salubri Antitribu'],/силой/);
});

test('Валерен: пять оригинальных сил V20 и доступные русские пояснения', () => {
  const valeren=DISCIPLINES.find(x=>x.name==='Valeren');
  assert.ok(valeren);
  assert.equal(displayName('Valeren'),'Валерен');
  assert.equal(canonicalName('Валерен'),'Valeren');
  assert.deepEqual(Object.values(valeren.system.powers).map(p=>p.name),[
    'Sense Vitality','Anesthetic Touch','Burning Touch',"Armor of Caine's Fury",'Vengeance of Samiel'
  ]);
  assert.equal(valeren.system.powers.lvl3.cost,'1 blood');
  assert.equal(valeren.system.powers.lvl4.primary,'attributes.stamina');
  assert.equal(valeren.system.powers.lvl4.secondary,'abilities.melee');
  assert.equal(valeren.system.powers.lvl4.difficulty,7);
  assert.equal(valeren.system.powers.lvl5.cost,'3 blood');
  const ru=russianDocument(valeren);
  for (let n=1;n<=5;n++) {
    assert.match(ru.system.powers[`lvl${n}`].name,/[А-Яа-яЁё]/);
    assert.ok(disciplineGuide('Valeren',n).length>70);
  }
  assert.match(ru.system.powers.lvl3.desc,/не наносятся уровни урона/);
  assert.match(ru.system.powers.lvl4.desc,/аггравированный/);
  assert.match(ru.system.powers.lvl5.desc,/уклонением/);
});

test('Подсказки воинской линии в мастере и установочная версия', () => {
  const template=fs.readFileSync(new URL('../templates/chargen.hbs',import.meta.url),'utf8');
  const logic=fs.readFileSync(new URL('../module/chargen.mjs',import.meta.url),'utf8');
  const manifest=JSON.parse(fs.readFileSync(new URL('../system.json',import.meta.url)));
  assert.match(template,/salubriWarriorCreationHint/);
  assert.match(logic,/d.clan === 'Salubri Antitribu'/);
  assert.equal(manifest.version,'1.2.0-ru.33');
  assert.ok(manifest.download.endsWith('/v1.2.0-ru.33/blood-onyx-v20-ru33.zip'));
});
