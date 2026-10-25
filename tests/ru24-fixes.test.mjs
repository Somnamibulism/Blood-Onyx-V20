import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { WEAPONS } from '../module/compendiums.mjs';
import { canonicalName, displayName } from '../module/ru/naming.mjs';
const read = rel => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
const sheet = read('module/vampire-sheet.mjs');
const boot = read('vtm-v20.mjs');
const html = read('templates/vampire-sheet.hbs');
const css = read('styles/blood-onyx-compact.css');

test('Штатные иконки Foundry: нет глобального SVG-обработчика и SVG-слоя листа', () => {
  assert.doesNotMatch(boot, /registerGlobalUiIconPatcher|\.vtm-ui-svg|UI_ICON_PATHS/);
  assert.doesNotMatch(sheet, /_syncWindowControlIcons|vtm-control-svg/);
  assert.doesNotMatch(css, /vtm-control-svg|vtm-control-icon-ready/);
  assert.match(sheet, /icon: "fas fa-file-export"/);
});

test('Каталог распознает малый и большой пистолет-пулемет и их автоматический огонь', () => {
  for (const title of ['SMG, Small', 'SMG, Large']) {
    const name = displayName(title);
    const item = WEAPONS.find(w => canonicalName(w.name) === canonicalName(name));
    assert.equal(item?.name, title);
    assert.equal(item.system.firearm, true);
    assert.ok(Number.parseInt(item.system.rate, 10) >= 10);
  }
  assert.match(sheet, /item\.system\.rate \|\| book\?\.system\.rate/);
  assert.match(sheet, /item\.system\.equipped && \(!!item\.system\.firearm \|\| !!item\.system\.range\)/);
});

test('Бросок инициативы доступен из любой вкладки и из боя, использует единый трекер', () => {
  assert.match(html, /ru-identity-initiative/);
  assert.match(html, /class="ru-roll-initiative"/);
  assert.match(sheet, /async _rollInitiativeFromSheet\(\)/);
  assert.match(sheet, /await combat\.rollInitiative\(\[combatant\.id\]\)/);
  assert.match(sheet, /await combatant\.unsetFlag\('vtm-v20', 'initPatched'\)/);
});

test('Описания ранений и отображаемые главные вкладки на русском', () => {
  assert.match(sheet, /Максимальная скорость бега уменьшается вдвое/);
  assert.doesNotMatch(sheet, /bruised: 'No penalties\.'/);
  assert.match(html, /> Характеристики<\/a>/);
  assert.match(html, /> Инвентарь<\/a>/);
});
