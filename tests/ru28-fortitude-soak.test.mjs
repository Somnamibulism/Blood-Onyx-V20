import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { computeSoakPool } from '../module/combat.mjs';

function actor({ fortitude = 0, armor = 0, skinOfTheAdder = false, type = 'vampire' } = {}) {
  return {
    type,
    system: { attributes: { stamina: 3 } },
    items: [
      { name: 'Стойкость', type: 'discipline', system: { level: fortitude } },
      { name: 'Защитная броня', type: 'armor', system: { rating: armor, equipped: true } },
    ],
    getFlag: (_, name) => name === 'skinOfTheAdder' ? skinOfTheAdder : null,
  };
}

for (const source of [
  ['когти', {}],
  ['солнце / огонь', { fireOrSunlight: true }],
  ['обход брони', { bypassArmor: true }],
]) {
  test(`Без Стойкости нельзя поглотить аггравированный урон (${source[0]}), даже с бронёй`, () => {
    const result = computeSoakPool(actor({ armor: 4 }), { dmgType: 'aggravated', ...source[1] });
    assert.equal(result.hasFortitude, false);
    assert.equal(result.requiresFortitude, true);
    assert.equal(result.canSoak, false);
    assert.equal(result.pool, 0);
    assert.match(result.parts.join(' '), /Нет Стойкости/);
  });
}

test('Стойкость 0 в списке дисциплин не открывает поглощение', () => {
  assert.equal(computeSoakPool(actor({ fortitude: 0 }), { dmgType: 'aggravated' }).canSoak, false);
});

test('Кожа гадюки не обходит требование Стойкости', () => {
  const result = computeSoakPool(actor({ skinOfTheAdder: true, armor: 4 }), { dmgType: 'aggravated' });
  assert.equal(result.canSoak, false);
  assert.equal(result.pool, 0);
});

test('Стойкость 1 разрешает поглощение огня/солнца только одним кубиком Стойкости', () => {
  const result = computeSoakPool(actor({ fortitude: 1, armor: 4 }), { dmgType: 'aggravated', fireOrSunlight: true });
  assert.equal(result.canSoak, true);
  assert.equal(result.pool, 1);
  assert.deepEqual(result.parts.filter(p => p.startsWith('Стойкость')), ['Стойкость 1']);
});

test('Стойкость 2 допускает броню при аггравированном уроне от когтей', () => {
  const result = computeSoakPool(actor({ fortitude: 2, armor: 3 }), { dmgType: 'aggravated' });
  assert.equal(result.canSoak, true);
  assert.equal(result.pool, 5);
});

test('Неаггравированный урон сохраняет прежнее поглощение', () => {
  const bash = computeSoakPool(actor({ armor: 2 }), { dmgType: 'bashing' });
  const lethal = computeSoakPool(actor({ armor: 2 }), { dmgType: 'lethal' });
  assert.equal(bash.pool, 5);
  assert.equal(lethal.pool, 5);
  assert.equal(bash.canSoak, true);
  assert.equal(lethal.canSoak, true);
});

test('Ручное поглощение проверяет Стойкость до выбора источника урона', () => {
  const src = readFileSync(new URL('../module/vampire-sheet.mjs', import.meta.url), 'utf8');
  const section = src.split('async _rollSoak(adjust = false) {')[1].split('// -- Blood buff')[0];
  assert.ok(section.indexOf("disciplineLevel(actor, 'fortitude') < 1") < section.indexOf("title: 'Источник аггравированного урона'"));
  assert.match(section, /return;/);
});

test('Автоматическое поглощение не спрашивает источник, если Стойкости нет', () => {
  const src = readFileSync(new URL('../module/combat.mjs', import.meta.url), 'utf8');
  assert.match(src, /isAgg && isKindred && disciplineLevel\(defender, 'fortitude'\) > 0/);
});
