import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {healCounts, damageCounts, TARGET_STATUSES} from '../module/target-actions.mjs';
import {countDamage, rebuildTrack, trackValues} from '../module/health-track.mjs';

function health(vals = [0,0,0,0,0,0,0]) {
 return {health:{extra:[],levels:Object.fromEntries(['bruised','hurt','injured','wounded','mauled','crippled','incapacitated'].map((k,i)=>[k,vals[i]]))}};
}
function withChanges(obj, changes) {
 const next=structuredClone(obj);
 for(const [path,val] of Object.entries(changes)) {
  const keys=path.replace(/^system\./,'').split('.');let t=next;
  for (const k of keys.slice(0,-1)) t=t[k];
  t[keys.at(-1)]=val;
 }
 return next;
}
test('Лечение сначала убирает летальные, затем ударные повреждения, не затрагивая аггравированные',()=>{
 const h=health([3,2,2,1,1,0,0]);
 const healed=healCounts(h,3,'normal');
 assert.equal(healed.healed,3);
 assert.deepEqual(healed.counts,{agg:1,leth:0,bash:1});
 assert.deepEqual(countDamage(withChanges(h,rebuildTrack(h,healed.counts))), healed.counts);
});
test('Лечение аггравированных не убирает другие типы ран',()=>{
 const h=health([3,3,2,1,0,0,0]);
 assert.deepEqual(healCounts(h,2,'aggravated'),{counts:{agg:0,leth:1,bash:1},healed:2});
});
test('Недопустимое лечение не приводит к отрицательным значениям',()=>{
 assert.deepEqual(healCounts(health([1,0,0,0,0,0,0]),10,'normal'),{counts:{agg:0,leth:0,bash:0},healed:1});
});
test('Урон на заполненной шкале повышает тяжесть существующих повреждений',()=>{
 const h=health([1,1,1,1,1,1,1]);
 const dmg=damageCounts(h,1,'bashing');
 assert.deepEqual(dmg,{agg:0,leth:1,bash:6});
 assert.deepEqual(trackValues(withChanges(h,rebuildTrack(h,dmg))),[2,1,1,1,1,1,1]);
});
test('Аггравированные повреждения переписывают менее тяжёлые при переполнении',()=>{
 assert.deepEqual(damageCounts(health([2,2,2,2,2,2,2]),2,'aggravated'),{agg:2,leth:5,bash:0});
});
test('Статусы, доступные в редакторе, имеют уникальные идентификаторы',()=>{
 assert.equal(new Set(TARGET_STATUSES.map(s=>s.id)).size,TARGET_STATUSES.length);
 assert.ok(TARGET_STATUSES.some(s=>s.id==='vtm-incapacitated'));
});
test('Папка готических значков содержит все используемые иконки',()=>{
 const base = new URL('../', import.meta.url);
 const js = fs.readFileSync(new URL('module/vampire-sheet.mjs',base),'utf8');
 const used=[...js.matchAll(/systems\/vtm-v20\/(assets\/ru\/combat\/[^'" ]+\.svg)/g)].map(m=>m[1]);
 assert.ok(used.length>=14,`Выбрано ${used.length} значков`);
 for(const rel of used){
  const file=new URL(rel,base);assert.ok(fs.existsSync(file),rel);
  const txt=fs.readFileSync(file,'utf8');assert.match(txt,/<svg.*viewBox=/);assert.match(txt,/<\/svg>/);
 }
});
test('Выбор цели, автоматические эффекты и хоумбрю представлены в интерфейсе',()=>{
 const base = new URL('../',import.meta.url);
 const a=fs.readFileSync(new URL('module/target-actions.mjs',base),'utf8');
 const v=fs.readFileSync(new URL('templates/vampire-sheet.hbs',base),'utf8');
 const i=fs.readFileSync(new URL('templates/item-sheet.hbs',base),'utf8');
 const d=fs.readFileSync(new URL('templates/roll-dialog.hbs',base),'utf8');
 assert.match(a,/pickSceneTarget/);assert.match(a,/setTarget/);
 assert.ok((v.match(/ru-homebrew-create/g)||[]).length>=8);
 assert.match(i,/effectPerSuccess/);assert.match(i,/effectStatus/);
 assert.match(d,/spendWp/);assert.match(d,/bloodBoost/);
});
