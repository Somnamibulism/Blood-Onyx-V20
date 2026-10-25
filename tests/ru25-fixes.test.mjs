import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { computeMovement } from '../module/movement.mjs';
import { gearPenalty } from '../module/dice.mjs';
const read = p => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const sheet = read('module/vampire-sheet.mjs');
const dialog = read('templates/roll-dialog.hbs');
const movement = read('module/movement.mjs');
const combat = read('module/combat.mjs');
const dice = read('module/dice.mjs');
const inventory = read('templates/vampire-sheet.hbs');
const exportSrc = read('module/sheet-export.mjs');

function mkActor(weight=0, injured=false) {
  return {
    system: {
      attributes: { strength: 2, dexterity: 3, stamina: 2 },
      health: { levels: { bruised: 0, hurt: 0, injured: injured ? 1 : 0, wounded: 0, mauled: 0, crippled: 0, incapacitated: 0 } }
    },
    items: [ { type: 'equipment', system: { weight, quantity: 1 } }, { type: 'container', system: { penalty: -4, equipped: true } } ],
    getFlag: () => false
  };
}

test('Большой вес не замедляет персонажа и не запрещает движение', () => {
  const light = computeMovement(mkActor());
  const heavy = computeMovement(mkActor(99999));
  assert.deepEqual(heavy, light);
  assert.equal(heavy.run, 29);
  assert.equal(computeMovement(mkActor(99999, true)).curLabel, 'Jog');
});

test('Рюкзаки не штрафуют Ловкость, штраф от брони остаётся', () => {
  const actor = mkActor(99999);
  assert.equal(gearPenalty(actor), 0);
  actor.items.push({ type: 'armor', system: { equipped: true, penalty: -2 } });
  assert.equal(gearPenalty(actor), -2);
});

test('Расчёты боя, броски, экспорт и лист не используют перегрузку', () => {
  for (const source of [movement, combat, dice, sheet, dialog, inventory, exportSrc]) {
    assert.doesNotMatch(source, /computeCarry\s*\(|isEncumbered\s*\(|encumbranceDiff|defEncumbered|carriedWeight|moveHalves|cannotMove|class="carrying-capacity"|encumbrance-diff-row/);
  }
  assert.doesNotMatch(inventory, /Перегрузка:/);
  assert.doesNotMatch(dialog, /Перегруз:/);
});

test('Blood Buff не заменяет HTML точек: нажатия на жёлтые и пустые сохраняются', () => {
  const begin = sheet.indexOf('  _renderBloodBuffUI(el, canEdit) {');
  const end = sheet.indexOf('    // Add toggle button to Attributes heading', begin);
  assert.ok(begin > 0 && end > begin);
  const section = sheet.slice(begin, end).trimEnd() + '\n}';
  const fn = new Function(`return function ${section}`)();
  let permanentStrength = 3;
  let buff = 1;
  const dots = [1,2,3,4,5].map(value => {
    const classes = new Set();
    return { dataset: { value: String(value) }, classList: { toggle(name, active) { if(active) classes.add(name); else classes.delete(name); }, contains(name) { return classes.has(name); } }, handlers: { click: true } };
  });
  const row = { querySelectorAll: () => dots, appended: [], appendChild(el) { this.appended.push(el); } };
  const el = { querySelector: sel => sel.includes('system.attributes.strength') ? row : null };
  const sheetObj = { document: { system: { attributes: { strength: permanentStrength } }, getFlag: () => ({ strength: buff }) } };
  const prior = globalThis.document;
  globalThis.document = { createElement: () => ({ className: '', textContent: '', title: '' }) };
  try {
    fn.call(sheetObj, el, true);
    assert.equal(dots[2].classList.contains('filled'), true);
    assert.equal(dots[3].classList.contains('blood-buff'), true);
    assert.equal(dots[4].classList.contains('empty'), true);
    assert.ok(dots.every(d => d.handlers.click), 'Ни один старый обработчик точек не потерян');
    assert.equal(row.appended.length, 0);
    permanentStrength = 5;
    sheetObj.document.system.attributes.strength = permanentStrength;
    const fullRow = { querySelectorAll: () => dots, appended: [], appendChild(el){ this.appended.push(el); } };
    const fullEl = { querySelector: sel => sel.includes('system.attributes.strength') ? fullRow : null };
    fn.call(sheetObj, fullEl, true);
    assert.ok(dots.every(d => d.classList.contains('filled')));
    assert.equal(fullRow.appended[0]?.textContent, '+1');
  } finally { globalThis.document = prior; }
});
