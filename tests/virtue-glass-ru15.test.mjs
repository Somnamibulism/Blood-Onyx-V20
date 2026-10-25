import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {initialRatings, updatesForVirtueClick, recalculateAllVirtues} from '../module/virtue-derivation.mjs';

const system = (virtues={conscience:3,selfControl:4,courage:4},wp={max:4,value:4},humanity=7) => ({virtues,willpower:wp,humanity});

test('V20 initial Humanity and permanent Willpower are computed from virtues',()=>{
  assert.deepEqual(initialRatings({conscience:3,selfControl:4,courage:4}), {humanity:7,willpower:4});
  assert.deepEqual(initialRatings({conscience:5,selfControl:5,courage:5}), {humanity:10,willpower:5});
});
test('Selecting Conscience dots updates Humanity, leaves spent willpower untouched',()=>{
  const up = updatesForVirtueClick(system(undefined,{max:5,value:0}), 'conscience', 4);
  assert.equal(up['system.humanity'],8);
  assert.equal(up['system.willpower.max'],undefined);
});
test('Selecting Self-Control dots updates Humanity',()=>{
  assert.equal(updatesForVirtueClick(system(), 'selfControl', 2)['system.humanity'],5);
});
test('Selecting Courage dots adjusts permanent Willpower while full',()=>{
  const up=updatesForVirtueClick(system(), 'courage', 5);
  assert.deepEqual([up['system.willpower.max'],up['system.willpower.value']],[5,5]);
});
test('Selecting Courage never restores already-spent temporary Willpower',()=>{
  const up=updatesForVirtueClick(system(undefined,{max:4,value:1}), 'courage', 5);
  assert.deepEqual([up['system.willpower.max'],up['system.willpower.value']],[5,1]);
});
test('Permanent Willpower reductions clamp temporary dots without spending them',()=>{
  const up=updatesForVirtueClick(system(undefined,{max:4,value:3}), 'courage', 2);
  assert.deepEqual([up['system.willpower.max'],up['system.willpower.value']],[2,2]);
});
test('Explicit manual Willpower override is protected',()=>{
  const up=updatesForVirtueClick(system(),'courage',5,{willpower:true});
  assert.equal(up['system.willpower.max'],undefined);
});
test('Explicit manual Humanity override is protected',()=>{
  const up=updatesForVirtueClick(system(),'conscience',5,{humanity:true});
  assert.equal(up['system.humanity'],undefined);
});
test('Manual recalculate restores derivation and leaves spent Willpower spent',()=>{
  const up=recalculateAllVirtues(system(undefined,{max:5,value:2},3));
  assert.equal(up['system.willpower.max'],4);
  assert.equal(up['system.willpower.value'],2);
  assert.equal(up['system.humanity'],7);
  assert.equal(up['flags.vtm-v20.virtueManualHumanity'],false);
});
test('Glass stylesheet loads last, has translucent app and pane + backdrop filter, other themes unchanged',()=>{
  const manifest=JSON.parse(fs.readFileSync(new URL('../system.json',import.meta.url)));
  assert.equal(manifest.styles.at(-1),'styles/glass-sheet-ru15.css');
  const css=fs.readFileSync(new URL('../styles/glass-sheet-ru15.css',import.meta.url),'utf8');
  assert.match(css,/body\.vtm-theme-glass-crimson \.vtm-v20\.sheet \.window-content/);
  assert.match(css,/backdrop-filter: blur\(16px\)/);
  assert.match(css,/rgba\(17, 7, 16, 0\.13\)/);
  assert.doesNotMatch(css,/body\.vtm-theme-dark-obsidian/);
});
test('Sheet listener persists automated ratings with chat-spend suppression',()=>{
  const sheet=fs.readFileSync(new URL('../module/vampire-sheet.mjs',import.meta.url),'utf8');
  const entry=fs.readFileSync(new URL('../vtm-v20.mjs',import.meta.url),'utf8');
  assert.match(sheet,/updatesForVirtueClick\(this\.document\.system/);
  assert.match(sheet,/vtmVirtueAutoSync: true/);
  assert.match(entry,/if \(options\?\.vtmVirtueAutoSync\) return;/);
});
