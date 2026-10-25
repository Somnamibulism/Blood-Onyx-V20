import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const template = fs.readFileSync(new URL('../templates/vampire-sheet.hbs', import.meta.url), 'utf8');
const moduleSource = fs.readFileSync(new URL('../module/vampire-sheet.mjs', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../styles/overview-pages-ru17.css', import.meta.url), 'utf8');
const manifest = JSON.parse(fs.readFileSync(new URL('../system.json', import.meta.url), 'utf8'));

test('Overview is a single page alongside the six existing sheets', () => {
  const nav = template.match(/<nav class="sheet-tabs"[\s\S]*?<\/nav>/)?.[0];
  assert.ok(nav);
  for (const tab of ['overview', 'stats', 'powers', 'status', 'combat', 'inventory', 'bio']) {
    assert.ok(nav.includes(`data-tab="${tab}"`), tab);
    assert.ok(template.includes(`data-group="primary" data-tab="${tab}"`), tab);
  }
  assert.match(template, /<div class="tab overview" data-group="primary" data-tab="overview">/);
  assert.equal((template.match(/class="sheet-top"/g) ?? []).length, 1);
  assert.equal((template.match(/class="money-section"/g) ?? []).length, 1);
});

test('Overview owns the identity fields and resources, other pages are not inside the header', () => {
  const general = template.split('class="tab overview"')[1].split('{{!-- STATS --}}')[0];
  for (const required of ['class="portrait-panel"', 'name="name"', 'name="system.clan"', 'name="system.sire"', 'class="status-bar"', 'class="wp-track"', 'class="money-section"']) {
    assert.ok(general.includes(required), required);
  }
  const firstTab = template.indexOf('data-tab="overview"', template.indexOf('<section class="sheet-body">'));
  const stats = template.indexOf('data-tab="stats"', firstTab);
  assert.ok(stats > firstTab, 'Stats follows overview as a sibling page');
  const firstHeader = template.indexOf('class="sheet-top"');
  assert.ok(firstHeader > template.indexOf('<section class="sheet-body">'), 'Identity is not permanently above pages');
});

test('Switching pages restores top scrolling and does not require edit access', () => {
  const tabBinding = moduleSource.indexOf("el.querySelectorAll('.sheet-tabs .item[data-tab]')");
  const ownershipGuard = moduleSource.indexOf('if (!this.isEditable) return;', tabBinding);
  assert.ok(tabBinding >= 0 && ownershipGuard > tabBinding);
  assert.match(moduleSource, /this\._syncTabs\(\{ resetScroll: true \}\)/);
  assert.match(moduleSource, /if \(resetScroll && body\) body\.scrollTop = 0/);
  assert.match(moduleSource, /_tab = "overview"/);
});

test('Dedicated pages occupy the remaining height and existing glass CSS stays last', () => {
  assert.match(css, /\.sheet-body\s*\{[^}]*flex: 1 1 auto/s);
  assert.match(css, /\.sheet-body\s*\{[^}]*overflow-y: auto/s);
  assert.match(css, /grid-template-columns: repeat\(7, minmax\(0, 1fr\)\)/);
  assert.ok(manifest.styles.includes('styles/overview-pages-ru17.css'));
  assert.equal(manifest.styles.at(-1), 'styles/glass-sheet-ru15.css');
});
