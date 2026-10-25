import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { updatesForVirtueClick, manuallySetWillpower, toggleWillpowerMode, recalculateAllVirtues } from '../module/virtue-derivation.mjs';
const actor = (courage=3, max=3, value=max) => ({virtues:{conscience:3,selfControl:3,courage},willpower:{max,value},humanity:6});

test('Changing Courage 3 -> 4 updates Willpower 3 -> 4 when full', () => {
  const change = updatesForVirtueClick(actor(), 'courage', 4);
  assert.equal(change['system.willpower.max'], 4);
  assert.equal(change['system.willpower.value'], 4);
});
test('Adding two permanent points creates adjustment +2 (instead of disabling link)', () => {
  const update = manuallySetWillpower(actor(), 5, false);
  assert.equal(update['system.willpower.max'], 5);
  assert.equal(update['system.willpower.value'], 5);
  assert.equal(update['flags.vtm-v20.virtueWillpowerAdjustment'], 2);
  assert.equal(update['flags.vtm-v20.virtueManualWillpower'], false);
  const after = actor(3, 5, 5);
  const upCourage = updatesForVirtueClick(after, 'courage', 4, { willpowerAdjustment: 2 });
  assert.equal(upCourage['system.willpower.max'], 6);
  assert.equal(upCourage['system.willpower.value'], 6);
});
test('Spent current Willpower does not recover when Courage grows and bonus remains', () => {
  const change = updatesForVirtueClick(actor(3,5,2), 'courage', 4, { willpowerAdjustment: 2 });
  assert.equal(change['system.willpower.max'], 6);
  assert.equal(change['system.willpower.value'], 2);
});
test('Reducing Courage clamps current WP to new rating', () => {
  const change = updatesForVirtueClick(actor(4,6,5), 'courage', 1, { willpowerAdjustment: 2 });
  assert.equal(change['system.willpower.max'], 3);
  assert.equal(change['system.willpower.value'], 3);
});
test('Explicit manual mode freezes the current rating, and returning to auto keeps it as a bonus', () => {
  assert.equal(toggleWillpowerMode(actor(3,6,4),false)['flags.vtm-v20.virtueManualWillpower'],true);
  const change = updatesForVirtueClick(actor(3,6,4),'courage',4,{willpower:true,willpowerAdjustment:3});
  assert.equal(change['system.willpower.max'],undefined);
  const resume = toggleWillpowerMode(actor(4,6,4),true);
  assert.equal(resume['flags.vtm-v20.virtueManualWillpower'],false);
  assert.equal(resume['flags.vtm-v20.virtueWillpowerAdjustment'],2);
});
test('Old ru15 manually adjusted sheets remain in manual mode until switched', () => {
  const change = updatesForVirtueClick(actor(3,6,4),'courage',4,{willpower:true});
  assert.equal(change['system.willpower.max'],undefined);
  const resume=toggleWillpowerMode(actor(4,6,4),true);
  assert.equal(resume['flags.vtm-v20.virtueWillpowerAdjustment'],2);
});
test('Explicit reset clears manual adjustment and restores both V20 base creation ratings', () => {
  const reset=recalculateAllVirtues(actor(4,6,2));
  assert.equal(reset['system.willpower.max'],4);
  assert.equal(reset['system.willpower.value'],2);
  assert.equal(reset['flags.vtm-v20.virtueWillpowerAdjustment'],0);
  assert.equal(reset['flags.vtm-v20.virtueManualWillpower'],false);
});
test('Manual Humanity rating persists after Conscience edits', () => {
  const change=updatesForVirtueClick(actor(),'conscience',5,{humanity:true});
  assert.equal(change['system.humanity'],undefined);
});
test('Willpower mode switch is wired into character sheet and accessible in HTML', () => {
  const sheet=fs.readFileSync(new URL('../module/vampire-sheet.mjs',import.meta.url),'utf8');
  const hbs=fs.readFileSync(new URL('../templates/vampire-sheet.hbs',import.meta.url),'utf8');
  assert.match(sheet,/\.wp-derivation-toggle/);
  assert.match(sheet,/willpowerAdjustment: this\.document\.getFlag/);
  assert.match(hbs,/wp-derivation-toggle/);
});
