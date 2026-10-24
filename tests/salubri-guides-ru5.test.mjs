import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {VTM} from '../module/config.mjs';
import {catalogs,clanDocuments} from '../module/ru/content.mjs';
import {disciplineGuide,disciplineGuides} from '../module/ru/discipline-guides.mjs';
import {canonicalName,displayName,russianDocument} from '../module/ru/naming.mjs';
import {weaknesses} from '../module/ru/extra.mjs';

const obeah=catalogs.DISCIPLINES.find(x=>x.name==='Obeah');
test('Салюбри есть в списке, дисциплины автоматически доступны',()=>{
  assert.ok(VTM.clans.includes('Salubri'));
  assert.deepEqual(VTM.clanDisciplines.Salubri,['Auspex','Fortitude','Obeah']);
  assert.ok(clanDocuments.some(x=>x.name==='Salubri'));
  assert.equal(displayName('Salubri'),'Салюбри');
});
test('У Салюбри корректный изъян V20, без выдуманного обязательного третьего глаза с первой точки',()=>{
  assert.match(weaknesses.Salubri,/Воли/);
  assert.match(weaknesses.Salubri,/со второго уровня Обеа/);
});
test('Обеа, пять сил, русские названия, оригинальные пояснения',()=>{
  assert.ok(obeah);
  assert.equal(displayName('Obeah'),'Обеа');
  assert.equal(canonicalName('Обеа'),'Obeah');
  const copy=russianDocument(obeah);
  assert.equal(copy.name,'Обеа');
  for(let level=1;level<=5;level++){
    const p=copy.system.powers[`lvl${level}`];
    assert.match(p.name,/[А-Яа-яЁё]/);
    assert.ok(p.desc.length>=300,`Обеа ${level} слишком кратко`);
    assert.ok(disciplineGuide('Obeah',level).length>=75);
  }
  assert.equal(obeah.system.powers.lvl1.primary,'attributes.perception');
  assert.equal(obeah.system.powers.lvl1.secondary,'abilities.medicine');
  assert.equal(obeah.system.powers.lvl3.cost,''); // переменная цена требует ручного учета
  assert.equal(obeah.system.powers.lvl4.cost,'2 Willpower');
});
test('У всех 18 дисциплин есть пояснение каждой из пяти точек',()=>{
  assert.equal(catalogs.DISCIPLINES.length,18);
  for(const d of catalogs.DISCIPLINES){
    assert.equal(disciplineGuides[d.name]?.length,5,d.name);
    for(let n=1;n<=5;n++){
      const note=disciplineGuide(d.name,n);
      assert.ok(note.length>=70,`${d.name} ${n}: ${note.length}`);
      assert.match(d.system.powers[`lvl${n}`].desc,/[А-Яа-яЁё]/);
      assert.match(d.system.powers[`lvl${n}`].desc,/(границы|Уровень|Эффект|Стоимость|Пример|Проверка|Система|Прикоснись|Салюбри|Описание)/i);
    }
  }
});
test('Лист содержит раскрывающиеся памятки для игрока и пояснения в карточке',()=>{
  const sheet=fs.readFileSync(new URL('../templates/vampire-sheet.hbs',import.meta.url),'utf8');
  const item=fs.readFileSync(new URL('../templates/item-sheet.hbs',import.meta.url),'utf8');
  assert.match(sheet,/details class="discipline-guide"/);
  assert.match(item,/Что дает уровень/);
  assert.match(sheet,/this.guides/);
});
test('Название новой дисциплины в русской V20 и старые варианты продолжают распознаваться',()=>{
  for(const [oldName,id] of Object.entries({'Прорицание':'Auspex','Химерия':'Chimerstry','Затемнение':'Obfuscate',
    'Власть над Тенью':'Obtenebration','Могущество':'Potence','Присутствие':'Presence',
    'Превращение':'Protean','Смертоносность':'Quietus','Изменчивость':'Vicissitude'}))
    assert.equal(canonicalName(oldName),id);
  assert.equal(displayName('Auspex'),'Ясновидение');
});
