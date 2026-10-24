import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join,dirname} from 'node:path';
const here=dirname(fileURLToPath(import.meta.url));
globalThis.Hooks={once:(_name,_cb)=>{}};
const {registerBloodOnyxDice,BLOOD_ONYX_SOURCE,BLOOD_ONYX_BUMP,BLOOD_ONYX_TEXTURE,BLOOD_ONYX_THEME}=await import('../module/onyx-dice.mjs');
test('Черная дымчатая текстура и карта рельефа входят в систему',async()=>{
  const tex=await readFile(join(here,'..','assets','dice','blood-onyx-smoke.webp'));
  const bump=await readFile(join(here,'..','assets','dice','blood-onyx-bump.png'));
  assert.ok(tex.length>1000);assert.ok(bump.length>500);
  assert.match(BLOOD_ONYX_SOURCE,/systems\/vtm-v20/);assert.match(BLOOD_ONYX_BUMP,/bump/);
});
test('Регистрация темы через API Dice So Nice 5.3.4 идет после загрузки текстуры',async()=>{
  const events=[];let texture;let set;let mode;
  const ds={addTexture:async(id,x)=>{events.push('texture');texture={id,...x}},addColorset:async(data,m)=>{events.push('colorset');set=data;mode=m}};
  assert.equal(await registerBloodOnyxDice(ds),true);
  assert.deepEqual(events,['texture','colorset']);
  assert.equal(texture.id,BLOOD_ONYX_TEXTURE);
  assert.equal(set.name,BLOOD_ONYX_THEME);
  assert.equal(set.material,'glass');
  assert.equal(set.foreground,'#e52939');
  assert.equal(set.texture,texture.id);
  assert.equal(mode,'preferred');
  assert.equal(await registerBloodOnyxDice(undefined),false);
});
