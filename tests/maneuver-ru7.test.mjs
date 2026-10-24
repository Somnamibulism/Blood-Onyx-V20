import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { CLOSE_COMBAT_MANEUVER_RULES as rules, damageDiceCount, soakDiceCount, actionDiceCount } from '../module/maneuver-rules.mjs';
const read = rel => fs.readFileSync(new URL('../'+rel, import.meta.url), 'utf8');

test('Таблица ближнего боя содержит все 13 маневров, включая три защиты', () => {
  for (const name of ['unarmed','kick','throw','clinch','hold','sweep','disarm','bite','claws','dodge','block','parry']) assert.ok(rules[name], name);
  assert.deepEqual(Object.keys(rules).filter(key=>rules[key].defensive),['dodge','block','parry']);
});
test('Бросок: Сила + Драка, сложность +1, ударный урон Сила +1, сбивание с ног', () => {
  assert.deepEqual(rules.throw.traits,['attributes.strength','abilities.brawl']);
  assert.equal(rules.throw.difficulty,1);
  assert.equal(rules.throw.damage,'Str+1');
  assert.equal(rules.throw.knockdown,true);
});
test('Захват +0 сложности и без повреждений', () => {
  assert.equal(rules.hold.difficulty,0);
  assert.equal(rules.hold.damage,null);
  assert.equal(rules.hold.continuing,true);
});
test('Когти: Ловкость + Драка, аггравированный урон', () => {
  assert.deepEqual(rules.claws.traits,['attributes.dexterity','abilities.brawl']);
  assert.equal(rules.claws.damageType,'aggravated');
  assert.match(read('module/vampire-sheet.mjs'),/clawStrike \? 'brawl'/);
});
test('Урон даже при штрафах имеет минимум один d10', () => {
  assert.equal(damageDiceCount(0),1);
  assert.equal(damageDiceCount(-5),1);
  assert.equal(damageDiceCount(6),6);
});
test('Поглощение без допустимого пула не получает бесплатного кубика', () => {
  assert.equal(soakDiceCount(0),0);
  assert.equal(soakDiceCount(-2),0);
  assert.equal(soakDiceCount(5),5);
});
test('Нулевой пул действия из-за ранений не получает бесплатного кубика', () => {
  assert.equal(actionDiceCount(0),0);
  assert.equal(actionDiceCount(-5),0);
  assert.equal(actionDiceCount(1),1);
});
test('Урон и поглощение не могут провалиться ботчем', () => {
  const combat=read('module/combat.mjs');
  assert.match(combat,/noBotch = false/);
  assert.match(combat,/evalPool\(dmgRoll, 6, false, true\)/);
  assert.match(combat,/evalPool\(soakRoll, soakData\.difficulty, false, true\)/);
});
test('После защиты с попаданием и отсутствия защиты автоматически разрешается урон', () => {
  const combat=read('module/combat.mjs');
  assert.match(combat,/await rollDamage\(damageMessage\)/);
  assert.match(combat,/if \(hit\) await rollDamage\(defenseMessage\)/);
  assert.match(combat,/await rollDamage\(automaticHitMessage\)/);
});
test('Бросок переносится через флаги атаки, защиты и применяет сбивание с ног', () => {
  const combat=read('module/combat.mjs');
  assert.match(combat,/isThrow: !!atk\.throw/);
  assert.match(combat,/isThrow: c\.isThrow === true/);
  assert.match(combat,/c\.isSweep \|\| c\.isThrow/);
});
test('Выбор Пути доступен в заблокированном листе и сохраняется', () => {
  const template=read('templates/vampire-sheet.hbs');
  const sheet=read('module/vampire-sheet.mjs');
  const css=read('styles/russian.css');
  assert.match(template,/class="path-select" title="Выбрать Путь или Человечность"/);
  assert.doesNotMatch(template, /path-select" \{\{#if sheetLocked\}\}style="pointer-events:none"/);
  assert.match(sheet,/querySelector\('\.path-select'\)/);
  assert.match(sheet,/system\.pathName': name/);
  assert.match(css,/\.path-select \{[^}]*pointer-events:auto!important/);
});
test('Боевые карточки приведены к компактному табличному виду',()=>{
  const hbs=read('templates/vampire-sheet.hbs');
  const css=read('styles/russian.css');
  assert.match(hbs,/ru-combat-table/);
  assert.match(css,/grid-template-columns:40px minmax\(132px,1fr\)/);
  assert.match(hbs,/Боевые манёвры/);
  assert.match(hbs,/Защитные манёвры/);
});
