import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { canToggleSheetLock, isSheetLocked } from '../module/sheet-lock.mjs';
import { snapshotHealth, healthChangeAudit, buildDamageReport } from '../module/combat-report.mjs';
import { applyHealthDamage } from '../module/combat.mjs';
import { trackValues } from '../module/health-track.mjs';

const path = (name) => new URL(`../${name}`, import.meta.url);
const levels = ['bruised','hurt','injured','wounded','mauled','crippled','incapacitated'];
const actor = (points = 0, locked = true) => ({
  type: 'vampire',
  system: { health: { levels: Object.fromEntries(levels.map((k,i)=>[k,i < points ? 3 : 0])), extra:[] } },
  isOwner:true,
  getFlag(_scope, key) { return key === 'sheetLocked' ? locked : null; },
  async update(changes) {
    for (const [path, val] of Object.entries(changes)) {
      const parts = path.split('.');let node = this;
      for (const k of parts.slice(0,-1)) node = node[k];
      node[parts.at(-1)] = val;
    }
  },
});

test('Замочек доступен владельцу и GM, но не постороннему зрителю',()=>{
  assert.equal(canToggleSheetLock({isOwner:true},{isGM:false}),true);
  assert.equal(canToggleSheetLock({isOwner:false},{isGM:false}),false);
  assert.equal(canToggleSheetLock({isOwner:false},{isGM:true}),true);
});
test('Замочек не влияет на автоматическое применение ранений', async()=>{
  const a=actor(0,true);
  const before=snapshotHealth(a);
  await applyHealthDamage(a,3,'aggravated');
  assert.deepEqual(trackValues(a.system),[3,3,3,0,0,0,0]);
  assert.equal(isSheetLocked(a,{isGM:false}),true);
  const audit=healthChangeAudit({before,after:snapshotHealth(a),requested:3});
  assert.equal(audit.status,'checked');
});
test('Полная шкала 7/7 аггравированных не даёт ложного предупреждения о правах',async()=>{
  const a=actor(7);const before=snapshotHealth(a);
  await applyHealthDamage(a,3,'aggravated');
  const audit=healthChangeAudit({before,after:snapshotHealth(a),requested:3});
  assert.equal(audit.status,'saturated');
  assert.match(audit.note,/Шкала уже заполнена аггравированными ранами/);
  assert.doesNotMatch(audit.note,/права записи/);
  const report=buildDamageReport({defenderName:'Тест',dmgSuccesses:3,netDamage:3,damageType:'aggravated',healthAudit:audit});
  assert.match(report.final,/шкала уже заполнена/);
  assert.doesNotMatch(report.final,/применено 3 ур/);
});
test('Подтверждённый урон и реальная ошибка записи сообщаются по-разному',()=>{
  const blank=snapshotHealth(actor());
  const failed=healthChangeAudit({before:blank,after:blank,requested:1});
  assert.equal(failed.status,'warning');
  assert.match(buildDamageReport({defenderName:'Тест',netDamage:1,healthAudit:failed}).final,/не подтверждена/);
});
test('Видимый на любой вкладке замок и проверка владения не изменяют права Foundry',()=>{
  const template=fs.readFileSync(path('templates/vampire-sheet.hbs'),'utf8');
  const sheet=fs.readFileSync(path('module/vampire-sheet.mjs'),'utf8');
  assert.match(template,/<div class="ru-persistent-identity"/);
  assert.match(template,/\{\{#if canUnlockSheet\}\}[\s\S]*?class="sheet-lock ru-identity-lock"/);
  assert.doesNotMatch(template,/\{\{#if isGM\}\}[\s\S]{0,50}class="sheet-lock"/);
  assert.match(sheet,/canToggleSheetLock\(this\.document, game\.user\)/);
  assert.match(sheet,/this\.document\.setFlag\('vtm-v20', 'sheetLocked'/);
});
