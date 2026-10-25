import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = p => readFileSync(new URL(`../${p}`,import.meta.url),'utf8');
const sheet = read('module/vampire-sheet.mjs');
const html = read('templates/vampire-sheet.hbs');
const roll = read('templates/roll-dialog.hbs');
const dice = read('module/dice.mjs');
const system = JSON.parse(read('system.json'));
test('Russian build has new UI and preserves Foundry 13 format',()=>{
  assert.equal(system.version,'1.2.0-ru.27');
  assert.ok(system.styles.includes('styles/identity-combat-ru22.css'));
  assert.equal(system.styles.at(-1),'styles/glass-sheet-ru15.css');
  assert.equal(system.compatibility.minimum,'13');
});
test('Dice fields keep attributes on the left, abilities/other tests on the right',()=>{
  const before = roll.split('<label>Способность / проверка</label>')[0];
  const after = roll.split('<label>Способность / проверка</label>')[1];
  assert.match(before,/each attrOpts/);assert.doesNotMatch(before,/each abilOpts|each virtOpts/);
  assert.match(after,/each abilOpts/);assert.match(after,/each virtOpts/);
  assert.doesNotMatch(after,/each attrOpts/);
  assert.match(dice,/\[trait, trait2\] = \[trait2, trait\]/);
});
test('No floating side dice and direct trait roll dialog',()=>{
  assert.doesNotMatch(sheet,/document\.body\.appendChild\(rqEl\)/);
  assert.doesNotMatch(sheet,/roll-quick-float/);
  assert.match(sheet,/el\.querySelectorAll\('\.rollable'\)/);
});
test('Persistent identity bar and money removal are both present',()=>{
  assert.ok(html.indexOf('ru-persistent-identity')<html.indexOf('sheet-tabs'));
  assert.match(html,/clanDisplay/);assert.match(html,/natureDisplay/);
  assert.doesNotMatch(html,/class="money-section"/);
});
test('Ranged helper uses equipped real weapons and existing attack + reload buttons',()=>{
  for(const mode of ['single','burst','auto','reload'])assert.ok(html.includes(`data-mode="${mode}"`));
  assert.match(sheet,/_chooseRangedManeuver\(mode\)/);
  assert.match(sheet,/item\.system\.equipped/);
  assert.match(sheet,/_promptFireMode\(atk, \{ forcedMode \}\)/);
  assert.match(sheet,/_declAddAttack\(attackId, forcedMode\)/);
  assert.match(html,/ru-combat-soak/);assert.match(html,/ru-combat-heal/);
});
test('Blood Buff is named and its activation is atomic',()=>{
  assert.match(sheet,/Усилить кровью/);
  assert.match(sheet,/blood-buff-explain/);
  const method=sheet.split('async _bloodBuffAdd(attr) {')[1].split('async _bloodBuffRemove(attr) {')[0];
  assert.match(method,/await actor\.update\(updates\)/);
  assert.doesNotMatch(method,/await actor\.setFlag/);
});
