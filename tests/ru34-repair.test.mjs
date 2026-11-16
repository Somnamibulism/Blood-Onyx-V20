import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {isSheetLocked,canManuallyEditSheet,canToggleSheetLock} from '../module/sheet-lock.mjs';
const read = p => fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const sheet=read('module/vampire-sheet.mjs');
const item=read('module/item-sheet.mjs');
const css=read('styles/glass-onyx-ru34.css');
const combat=read('module/combat.mjs');
const manifest=JSON.parse(read('system.json'));
test('ru.34: one native theme selector, custom black Glass Onyx class',()=>{
 assert.match(read('vtm-v20.mjs'),/themes:\s*null/);
 assert.match(read('vtm-v20.mjs'),/blackglass: 'Glass Onyx/);
 assert.ok(manifest.styles.includes('styles/glass-onyx-ru34.css'));
 assert.match(css,/body\.vtm-theme-glass-onyx\.vtm-theme-glass-crimson/);
});
test('ru.34: lock blocks manual changes even for GM but allows unlock',()=>{
 const a={isOwner:true,getFlag:()=>true};
 const gm={isGM:true};
 const player={isGM:false};
 assert.equal(isSheetLocked(a,gm),true);
 assert.equal(canManuallyEditSheet(a,gm),false);
 assert.equal(canManuallyEditSheet(a,player),false);
 assert.equal(canToggleSheetLock(a,player),true);
 const unlocked={...a,getFlag:()=>false};
 assert.equal(canManuallyEditSheet(unlocked,player),true);
 assert.match(sheet,/if \(this\._chargen \|\| isSheetLocked/);
 assert.match(sheet,/\.sheet-inner \[name\]/);
 assert.match(item,/this\.document\.parent && isSheetLocked/);
});
test('ru.34: fire and rituals are localized',()=>{
 assert.match(sheet,/Прикуривание сигареты/);
 assert.match(sheet,/Факел \(ожоги второй степени\)/);
 assert.match(read('templates/item-sheet.hbs'),/Проверка ритуала/);
 assert.match(read('vtm-v20.mjs'),/Таймер объявления действий/);
 assert.match(item,/translatedCatalogContent\[canonical\]/);
});
test('ru.34: gun maneuvers select actual weapon, melee maneuvers have correct weapon damage',()=>{
 for(const m of ['moving','aim','multi','dual','strafe'])assert.match(read('templates/vampire-sheet.hbs'),new RegExp(`data-mode="${m}"`));
 assert.match(sheet,/Оружие для манёвра/);
 assert.match(sheet,/forcedWeaponId:w\.id/);
 assert.match(sheet,/disarm-weapon-\$\{w\.id\}/);
 assert.match(sheet,/disarm:true,forcedWeaponId:w\.id/);
 assert.match(sheet,/damageFormula:w\.system\.damage \|\| 'Str'/);
 assert.match(combat,/options\.movingShot/);
 assert.match(combat,/aimBonus/);
 assert.match(sheet,/this\._executeStrafe/);
});
