import { test } from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {WEAPONS} from '../module/compendiums.mjs';
import {displayName, canonicalName} from '../module/ru/naming.mjs';
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('Коктейль Молотова поставляется в локализованном каталоге метательного оружия', () => {
  const weapon = WEAPONS.find(w => w.name === 'Molotov Cocktail');
  assert.ok(weapon);
  assert.equal(displayName(weapon.name), 'Коктейль Молотова');
  assert.equal(canonicalName('Коктейль Молотова'), weapon.name);
  assert.equal(weapon.system.thrown, true);
  assert.equal(weapon.system.damageType, 'aggravated');
  assert.equal(weapon.system.firearm, undefined);
  assert.equal(weapon.system.incendiary, true);
  assert.ok(weapon.system.range);
  assert.match(read('module/compendiums.mjs'), /weapons: \['Dart', 'Throwing Knife', 'Molotov Cocktail'/);
  assert.match(read('module/item-data.mjs'), /thrown: new f\.BooleanField/);
});

test('Метательный зажигательный предмет бросается через Атлетику, не через стрельбу', () => {
  const sheet = read('module/vampire-sheet.mjs');
  assert.match(sheet, /isThrown \? 'athletics' : isRanged \? 'firearms'/);
  assert.match(sheet, /isThrown \? 'Атлетика' : isRanged \? 'Стрельба'/);
  assert.match(sheet, /!item\.system\.thrown && canonicalName\(item\.name\) !== 'Molotov Cocktail'/);
  const combat = read('module/combat.mjs');
  assert.match(combat, /incendiary: !!atk.incendiary/);
  assert.match(combat, /let fireOrSunlight = !!c.incendiary/);
});

test('Компактная шапка не требует седьмой колонки, инициатива переносится внутрь', () => {
  const style = read('styles/identity-combat-ru22.css');
  const html = read('templates/vampire-sheet.hbs');
  assert.match(style, /ru\.27: short flexible identity bar/);
  assert.match(style, /\.ru-persistent-identity \{\n  display:flex; flex-wrap:wrap/);
  assert.match(style, /\.ru-identity-vitals \{\n  display:flex; flex:1 0 100%/);
  assert.match(style, /\.ru-roll-initiative\.ru-identity-initiative \{/);
  assert.ok(html.indexOf('<div class="ru-identity-vitals"') < html.indexOf('<div class="ru-identity-more">'));
});

test('Имя актёра синхронизируется с прототипом, сценами и участниками боя', () => {
  const entry = read('vtm-v20.mjs');
  assert.match(entry, /Hooks\.on\('updateActor', \(actor, changes, options\) =>/);
  assert.match(entry, /if \(!Object\.hasOwn\(changes, 'name'\)/);
  assert.match(entry, /'prototypeToken\.name': newName/);
  assert.match(entry, /scene\.updateEmbeddedDocuments\('Token', updates\)/);
  assert.match(entry, /combat\.updateEmbeddedDocuments\('Combatant', updates\)/);
  assert.match(entry, /tokenNamesSynced27/);
  assert.match(entry, /Hooks.on\('preCreateToken'/);
  assert.match(entry, /name: actorName/);
});
