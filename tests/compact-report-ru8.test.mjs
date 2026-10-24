import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildDamageReport } from '../module/combat-report.mjs';
const read = relative => fs.readFileSync(new URL('../' + relative, import.meta.url), 'utf8');

test('Боевое меню в двух колонках, центрировано и адаптивно по ширине листа', () => {
  const css = read('styles/blood-onyx-compact.css');
  assert.match(css, /\.ru-combat-table\s*\{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /@container \(max-width: 530px\)/);
  assert.match(css, /\.attack-name[\s\S]*text-align: center/);
});
test('Выдвижные панели остаются внутри листа и не создают горизонтальную прокрутку', () => {
  const css = read('styles/blood-onyx-compact.css');
  for (const cls of ['combat-drawer', 'targeting-drawer', 'movement-drawer']) assert.ok(css.includes('.' + cls));
  assert.match(css, /\.combat-drawer,\s*\.vtm-v20\.sheet \.targeting-drawer,\s*\.vtm-v20\.sheet \.movement-drawer\s*\{[^}]*left: auto;[^}]*right: 10px;[^}]*overflow-x: hidden;/);
  assert.match(css, /\.roll-dialog \.window-content[^}]*overflow-x: hidden;/s);
});
test('Урон фиксирует последовательность атаки, защиты, поглощения и корректировки', () => {
  const r=buildDamageReport({ compared:true,attackSuccesses:5,defenseSuccesses:2,netSuccesses:3,defenseLabel:'Уклонение',
    defenderName:'Соня',dmgPool:5,dmgDifficulty:6,dmgDice:[{value:9},{value:7},{value:1},{value:10},{value:4}],
    dmgDiceTotal:3,dmgAutoSuccesses:2,dmgSuccesses:5,soakPool:4,soakDifficulty:6,soakDice:[{value:7},{value:8}],soakSuccesses:2,
    netDamage:1,damageType:'bashing',condition:'Ранен' });
  assert.match(r.steps[0].text,/5 успехов атаки − 2 успехов защиты = 3/);
  assert.ok(r.steps.some(x => x.text.includes('сложность 6') && x.text.includes('[9, 7, 1, 10, 4]')));
  assert.ok(r.steps.some(x => x.text.includes('остановлено 2 из 5')));
  assert.ok(r.steps.some(x => x.text.includes('max(0, 5 − 2) = 3')));
  assert.ok(r.steps.some(x => x.text.includes('3 → 1')));
  assert.match(r.final,/Здоровье \(Соня\): применено 1 ур. \(ударный\)/);
});
test('Полное поглощение не сообщает о нанесенных ранениях и учитывает лишние успехи', () => {
  const r=buildDamageReport({dmgDice:[],dmgSuccesses:2,soakDice:[{value:10},{value:8},{value:7}],soakSuccesses:3,soakPool:4,netDamage:0,damageType:'lethal'});
  assert.ok(r.steps.some(x=>x.text.includes('остановлено 2 из 2')));
  assert.ok(r.steps.some(x=>x.text.includes('max(0, 2 − 3) = 0')));
  assert.match(r.final,/0 уровней/);
});
test('Обезоруживание не списывает здоровье даже при больших успехах',()=>{
  const r=buildDamageReport({dmgSuccesses:5,disarmMode:true,disarmStr:3,disarmSuccess:true,dmgDice:[{value:10}],dmgPool:1});
  assert.match(r.final,/нет/);
  assert.ok(r.steps.some(s=>s.text.includes('Оружие выбито')));
  assert.equal(r.steps.some(s=>s.label==='После поглощения'),false);
});
test('Поцелуй никогда не объявляется потерей здоровья',()=>{
  const r=buildDamageReport({dmgSuccesses:4,soakSuccesses:1,soakSkipped:false,kissMode:true,kissPenetrated:true,netDamage:3,dmgDice:[{value:8}],soakDice:[{value:7}],dmgPool:1,soakPool:1});
  assert.match(r.final,/уровни здоровья не списываются/);
});
test('Все источники урона проходят один форматтер, при этом расчет и действия сохранены',()=>{
  for (const fn of ['module/combat.mjs','module/vampire-sheet.mjs']) {
    const source=read(fn);
    assert.match(source,/import \{ renderDamageCard \} from '.\/combat-report\.mjs'/);
    assert.doesNotMatch(source,/renderTemplate\('systems\/vtm-v20\/templates\/damage-card\.hbs'/);
    assert.match(source,/renderDamageCard\(\{/);
  }
  const manifest=JSON.parse(read('system.json'));
  assert.equal(new Set(manifest.styles).size,manifest.styles.length);
  assert.ok(manifest.styles.includes('styles/blood-onyx-compact.css'));
  const chat=read('templates/damage-card.hbs');
  assert.match(chat,/detailedReport\.steps/);
});
