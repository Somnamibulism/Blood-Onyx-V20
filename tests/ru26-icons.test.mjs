import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = rel => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
const css = read('styles/russian.css');
const sheet = read('module/vampire-sheet.mjs');
const globalStyle = read('styles/vtm-v20.css');
const meta = JSON.parse(read('system.json'));

test('Текстовая гарнитура не перехватывает Font Awesome на кнопках Foundry 13', () => {
  assert.doesNotMatch(css, /\.vtm-v20 :not\(i\):not\(svg\)/);
  assert.match(css, /button:not\(\[class\*="fa-"\]\)/);
  assert.match(css, /Font Awesome 6 Pro/);
  assert.match(css, /\.vtm-v20 \.window-header :is\(button,a\)\[class\*="fa-"\]/);
});

test('Три штатные иконки верхней панели соответствуют функциям и не дублируются', () => {
  for(const cls of ['fas fa-user','fas fa-download','fas fa-heart']) assert.match(sheet, new RegExp(`icon: "${cls}"`));
  assert.doesNotMatch(sheet, /_syncWindowControlIcons|vtm-control-svg/);
  assert.doesNotMatch(globalStyle, /\.vtm-ui-svg/);
});

test('Порядок CSS в манифесте сохраняет русскую настройку шрифта, совместимость Foundry 13', () => {
  assert.equal(meta.version,'1.2.0-ru.28');
  assert.equal(meta.compatibility.maximum,'13');
  assert.ok(meta.styles.includes('styles/russian.css'));
});
