import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { auditDice, snapshotHealth, healthChangeAudit, buildDamageReport } from '../module/combat-report.mjs';

const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const actor = values => ({system:{health:{levels:{bruised:values[0],hurt:values[1],injured:values[2],wounded:values[3],mauled:values[4],crippled:values[5],incapacitated:values[6]},extra:[]}}});

test('Журнал отдельно считает удачи, единицы, специализации, автоматические успехи', () => {
  const dice = [10, 8, 6, 1, 4, 10].map(value => ({value}));
  const normal = auditDice(dice, 6, {automatic:2});
  assert.deepEqual([normal.hits,normal.ones,normal.tens,normal.total],[4,1,0,5]);
  assert.match(normal.breakdown,/4 успешных кубиков/);
  assert.match(normal.breakdown,/− 1 единиц/);
  assert.match(normal.breakdown,/автоматических успехов 2/);
  assert.equal(auditDice(dice,6,{automatic:2,specialty:true}).total,7);
  assert.equal(auditDice([],6),null);
});

test('В журнале указаны защитник, тип урона и разобранные кости поглощения', () => {
  const r=buildDamageReport({attackerName:'Астарион',defenderName:'Соня',weaponName:'Кинжал',damageType:'lethal',
    compared:true,attackSuccesses:4,defenseSuccesses:1,netSuccesses:3,defenseLabel:'Уклонение',
    dmgPool:5,dmgDifficulty:6,dmgDice:[{value:9},{value:7},{value:1},{value:8},{value:2}],dmgSuccesses:2,dmgDiceTotal:2,
    soakPool:4,soakDifficulty:6,soakDice:[{value:9},{value:8},{value:1},{value:3}],soakSuccesses:1,
    soakLabel:'Выносливость 3 + Броня 1',netDamage:1});
  assert.match(r.steps.map(s=>s.text).join(' '),/Соня: 4d10, сложность 6/);
  assert.match(r.steps.map(s=>s.text).join(' '),/Выносливость 3 \+ Броня 1/);
  assert.ok(r.steps.some(s=>s.label==='Проверка кубов поглощения' && s.text.includes('− 1 единиц')));
  assert.match(r.final,/Соня/);
});

test('Снимок ран отличает ударный, летальный и аггравированный урон', () => {
  const pre = snapshotHealth(actor([1,1,0,0,0,0,0]));
  const post = snapshotHealth(actor([3,2,2,1,1,0,0]));
  const a=healthChangeAudit({before:pre,after:post,requested:2});
  assert.match(a.before,/ударных 2, летальных 0, аггравированных 0/);
  assert.match(a.after,/ударных 2, летальных 2, аггравированных 1/);
  assert.equal(a.status,'checked');
  assert.match(a.note,/Лист цели обновлён/);
});

test('Запись чужому токену не выдаётся за подтверждённую локальную синхронизацию',()=>{
  const pre=snapshotHealth(actor([0,0,0,0,0,0,0]));
  const a=healthChangeAudit({before:pre,after:pre,requested:3,remote:true,acknowledgement:{applied:3}});
  assert.equal(a.status,'remote');
  assert.match(a.note,/Ведущий подтвердил применение 3 ур/);
  assert.match(a.note,/может обновиться позднее/);
  const local=healthChangeAudit({before:pre,after:pre,requested:3});
  assert.equal(local.status,'warning');
  assert.match(local.note,/ВНИМАНИЕ/);
});

test('Полное поглощение не записывает урон, но отражает результат кости',()=>{
  const pre=snapshotHealth(actor([0,0,0,0,0,0,0]));
  const a=healthChangeAudit({before:pre,after:pre,requested:0});
  const report=buildDamageReport({attackerName:'Соня',defenderName:'Релл',dmgSuccesses:3,
    soakPool:4,soakDifficulty:6,soakDice:[{value:10},{value:9},{value:8},{value:7}],soakSuccesses:4,
    netDamage:0,damageType:'bashing',healthAudit:a});
  assert.ok(report.steps.some(s=>s.label==='После поглощения'&&s.text.includes('max(0, 3 − 4) = 0')));
  assert.ok(report.steps.some(s=>s.label==='Подтверждение записи'&&s.text.includes('не требовалась')));
  assert.match(report.final,/0 уровней/);
});

test('Карточки боя и внешних источников передают в журнал данные до/после',()=>{
  const combat=read('module/combat.mjs');const hazards=read('module/vampire-sheet.mjs');
  const template=read('templates/damage-card.hbs');
  assert.match(combat,/damageAcknowledgement = await applyHealthDamage/);
  assert.match(combat,/healthChangeAudit\(\{/);
  assert.match(hazards,/healthAudit,\n/);
  assert.match(hazards,/самостоятельное поглощение/);
  assert.match(template,/Журнал боя: подробный расчёт/);
  assert.match(template,/detailedReport\.steps/);
});
