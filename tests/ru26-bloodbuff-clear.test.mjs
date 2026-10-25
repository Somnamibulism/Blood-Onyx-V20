import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const sheet = readFileSync(new URL('../module/vampire-sheet.mjs', import.meta.url), 'utf8');
const css = readFileSync(new URL('../styles/identity-combat-ru22.css', import.meta.url), 'utf8');
test('Blood Buff offers one-click removal and drawer-wide removal', () => {
  assert.match(sheet, /hasAnyBuff && canEdit/);
  assert.match(sheet, /clearButton\.textContent = 'Снять усиление'/);
  assert.match(sheet, /blood-buff-clear-all/);
  assert.match(sheet, /_bloodBuffClear\(\)/);
  assert.match(css, /\.blood-buff-clear-all/);
});
test('Blood Buff clear is one atomic update only removing temporary flags', () => {
  const clearMethod = sheet.split('  async _bloodBuffClear() {')[1]?.split('  // -- Healing with blood')[0];
  assert.ok(clearMethod);
  assert.match(clearMethod, /if \(!actor\.isOwner\) return;/);
  assert.match(clearMethod, /flags\.vtm-v20\.-=bloodBuffs/);
  assert.match(clearMethod, /flags\.vtm-v20\.-=bloodBuffDecay/);
  assert.match(clearMethod, /await actor\.update\(/);
  assert.doesNotMatch(clearMethod, /system\.attributes|system\.blood|setFlag|unsetFlag/);
});
