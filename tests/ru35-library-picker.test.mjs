import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { WEAPONS } from '../module/compendiums.mjs';
import { RITUALS } from '../module/rituals-data.mjs';
import vm from 'node:vm';

const src = readFileSync(fileURLToPath(new URL('../module/vampire-sheet.mjs', import.meta.url)), 'utf8');
const start = src.indexOf('  _bindInlineLibraries(el, {canEdit = false} = {}) {');
const end = src.indexOf('\n  async _addFromLibrary(', start);
assert.ok(start >= 0 && end > start, 'the live inline library binder must be present');

function controls(kind) {
  const handlers = new Map();
  const search = { value: '', focus() {}, addEventListener(type, fn) { handlers.set(`search:${type}`, fn); } };
  const select = {
    value: '', options: [],
    replaceChildren() { this.options = []; this.value = ''; },
    append(option) { this.options.push(option); },
    add(option) { this.options.push(option); }
  };
  const add = { disabled: false, title: '', addEventListener(type, fn) { handlers.set(`add:${type}`, fn); } };
  const open = { addEventListener(type, fn) { handlers.set(`open:${type}`, fn); } };
  const parts = { '.ru-library-search': search, '.ru-library-choice': select, '.ru-library-add': add, '.ru-library-open': open };
  const picker = {
    dataset: { libraryKind: kind }, open: true,
    querySelector(selector) { return parts[selector]; },
    addEventListener(type, fn) { handlers.set(`picker:${type}`, fn); }
  };
  return { search, select, add, open, picker, handlers };
}

function setup(kind, unlocked) {
  const ctrl = controls(kind);
  const actor = {unlocked};
  const imports = [];
  const methodSource = src.slice(start, end).trim();
  const ctx = {
    RU_LIBRARY_SOURCES: { weapon: WEAPONS, ritual: RITUALS },
    LIBRARY_GROUPS: {weapon: {pack:'weapons'}, ritual: {pack:'rituals'}},
    displayName: name => name,
    canManuallyEditSheet: actor => actor.unlocked,
    game: { user: {}, packs: {get: () => null} },
    ui: { notifications: {warn: () => {}} },
    document: { createElement: () => ({value:'',textContent:''}) },
    Option: class { constructor(text, value) { this.textContent=text; this.value=value; } }
  };
  const obj = vm.runInNewContext('({' + methodSource + '\n})', ctx);
  obj.document = actor;
  obj._addFromLibrary = async (item, packName) => { imports.push([item.name, packName]); };
  obj._bindInlineLibraries({ querySelectorAll: () => [ctrl.picker] }, {canEdit: unlocked});
  return { ctrl, actor, imports };
}
const click = {preventDefault() {}};

test('weapon catalog is visible on a locked sheet but cannot be added', async () => {
  const {ctrl, imports} = setup('weapon', false);
  assert.equal(ctrl.select.options.length, WEAPONS.length);
  assert.equal(ctrl.select.options[0].textContent, WEAPONS[0].name);
  assert.equal(ctrl.add.disabled, true);
  assert.match(ctrl.add.title, /Разблокируйте/);
  await ctrl.handlers.get('add:click')(click);
  assert.equal(imports.length, 0);
});

test('search works while locked for non-weapon libraries too', () => {
  const {ctrl} = setup('ritual', false);
  assert.equal(ctrl.select.options.length, RITUALS.length);
  ctrl.search.value = RITUALS[0].name;
  ctrl.handlers.get('search:input')();
  assert.ok(ctrl.select.options.length >= 1);
  assert.equal(ctrl.add.disabled, true);
});

test('unlocked sheet permits adding weapons, including after searching', async () => {
  const {ctrl,imports} = setup('weapon', true);
  assert.equal(ctrl.add.disabled, false);
  ctrl.search.value = 'Rapier';
  ctrl.handlers.get('search:input')();
  assert.equal(ctrl.select.options.length, 1);
  await ctrl.handlers.get('add:click')(click);
  assert.equal(imports.length, 1);
  assert.deepEqual(imports[0], ['Rapier','weapons']);
  ctrl.search.value = '___not_present___';
  ctrl.handlers.get('search:input')();
  assert.equal(ctrl.add.disabled, true);
  assert.equal(ctrl.select.options[0].textContent, 'Ничего не найдено');
});

test('adding is still guarded if another client locks the sheet after rendering', async () => {
  const {ctrl, actor, imports} = setup('weapon', true);
  actor.unlocked = false;
  await ctrl.handlers.get('add:click')(click);
  assert.equal(imports.length, 0);
});

test('binder runs before read-only early return and import itself checks lock', () => {
  const bind = src.indexOf('this._bindInlineLibraries(el, {canEdit});');
  const ret = src.indexOf('if (!this.isEditable) return;', bind);
  assert.ok(bind >= 0 && ret > bind);
  assert.match(src, /async _addFromLibrary\(item, packName\) \{\s*if \(!this\.isEditable \|\| !canManuallyEditSheet\(this\.document, game\.user\)\) return;/);
});
