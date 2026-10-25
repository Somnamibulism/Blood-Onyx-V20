import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildDamageReport } from '../module/combat-report.mjs';
const read = rel => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');

// No 'open' attribute: messages must start folded for new chat content.
test('Detailed damage report is collapsed by default while visible dice and totals remain outside', () => {
  const t=read('templates/damage-card.hbs');
  assert.match(t, /<details class="vtm-chronicle-report vtm-foldable"/);
  assert.match(t, /<summary class="vtm-report-title"/);
  assert.doesNotMatch(t, /<details[^>]+\bopen\b/);
  const detailsAt=t.indexOf('<details class="vtm-chronicle-report');
  const firstDice=t.indexOf('{{#each dmgDice}}');
  const soakDice=t.indexOf('{{#each soakDice}}');
  const glance=t.indexOf('class="vtm-combat-glance"');
  assert.ok(firstDice<detailsAt && soakDice<detailsAt && glance<detailsAt);
  assert.ok(t.indexOf('{{#each detailedReport.steps}}')>detailsAt);
  assert.ok(t.indexOf('class="combat-summary"')>t.indexOf('</details>',detailsAt));
  assert.match(t,/{{#if soakSkipped}}0{{else}}{{soakSuccesses}}{{\/if}}/);
});

test('Attack result and control buttons remain visible while comparison and audit are folded',()=>{
  const t=read('templates/combat-card.hbs');
  assert.match(t,/class="roll-dice"/);
  assert.match(t,/class="roll-result"/);
  assert.match(t,/class="vtm-chronicle-report vtm-foldable"/);
  const lastClose=t.lastIndexOf('</details>');
  assert.ok(lastClose>0 && t.indexOf('class="combat-defend-btn"')>lastClose);
  assert.ok(t.indexOf('class="combat-damage-btn"')>lastClose);
  assert.match(t,/{{diceAudit.breakdown}}/);
  assert.match(t,/{{defenseSuccesses}}/);
});

test('Discipline roll keeps dice and success or failure always visible',()=>{
  const t=read('templates/roll-result.hbs');
  const details=t.indexOf('<details class="vtm-power-audit');
  assert.ok(details>t.indexOf('class="roll-result"') && details>t.indexOf('class="roll-dice"'));
  assert.ok(t.indexOf('powerMeta.basis')>details);
  const item=read('module/item-sheet.mjs');
  assert.match(item, /class="vtm-compact-dice"/);
  assert.match(item, /class="vtm-power-audit vtm-foldable"/);
  assert.ok(item.indexOf('class="roll-result"')<item.indexOf('class="vtm-power-audit vtm-foldable"'));
  assert.match(item,/await ChatMessage.create/);
});

test('Full damage calculation is preserved, independent of its collapsed view',()=>{
  const r=buildDamageReport({attackerName:'Соня',defenderName:'Тест',dmgPool:6,
    dmgDice:[{value:10},{value:8},{value:4},{value:8},{value:9},{value:1}],
    dmgSuccesses:2,soakPool:1,soakDice:[{value:7}],soakSuccesses:1,
    netDamage:1, damageType:'bashing'});
  assert.ok(r.steps.some(s=>s.label==='Проверка кубов урона'));
  assert.ok(r.steps.some(s=>s.label==='Поглощение'));
  assert.ok(r.steps.some(s=>s.label==='После поглощения'));
  assert.match(r.final,/применено 1 ур/);
});

test('Chat styles load without changing sheet CSS order or adding JS hooks',()=>{
  const m=JSON.parse(read('system.json'));
  assert.match(m.version,/^1\.2\.0-ru\.(?:2[0-9]|[3-9][0-9])$/);
  assert.ok(m.styles.includes('styles/chat-fold-ru20.css'));
  assert.equal(m.styles.at(-1),'styles/glass-sheet-ru15.css');
  const css=read('styles/chat-fold-ru20.css');
  assert.match(css,/summary\.vtm-report-title/);
  assert.match(css,/\[open\]/);
  assert.match(css, /body\.vtm-theme-glass-crimson/);
  assert.match(css, /body\.vtm-theme-printed/);
  assert.doesNotMatch(css, /\.vtm-report-body\s*\{[^}]*display:\s*none/s); // Native details controls body visibility.
});
