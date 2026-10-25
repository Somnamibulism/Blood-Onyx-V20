import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join,dirname} from 'node:path';
import {EQUIPMENT, CONTAINERS, V5_LORE} from '../module/library-extras.mjs';
const root=dirname(dirname(fileURLToPath(import.meta.url)));
const read=(f)=>readFileSync(join(root,f),'utf8');
test('Переключение тем ru.12 и импорт новых библиотек остаются в сборке',()=>{
 const system=JSON.parse(read('system.json'));
 assert.equal(system.version,'1.2.0-ru.13');
 assert.deepEqual(['equipment','containers','v5lore'].map(name => system.packs.find(p=>p.name===name).type),['Item','Item','Item']);
 for(const name of ['Dark Obsidian','Glass Crimson'])assert.ok(read('vtm-v20.mjs').includes(name));
});
test('Лист поддерживает 11 раскрывающихся меню с поиском и добавлением',()=>{
 const tpl=read('templates/vampire-sheet.hbs');
 const names=['discipline','background','merit','flaw','path','ritual','weapon','armor','equipment','container','v5lore'];
 for(const key of names)assert.ok(tpl.includes(`data-library-kind="${key}"`),key);
 assert.equal((tpl.match(/class="ru-library-add"/g)||[]).length,names.length);
 assert.ok(read('module/vampire-sheet.mjs').includes('_addFromLibrary'));
});
test('Дополнительные материалы V5 не привносят механические преимущества',()=>{
 assert.equal(EQUIPMENT.length,14);
 assert.equal(CONTAINERS.length,6);
 assert.equal(V5_LORE.length,10);
 for(const item of V5_LORE){
   assert.equal(item.type,'background');
   assert.equal(item.system.rating,0);
   assert.equal(item.flags['vtm-v20'].loreOnly,true);
 }
});
test('Восстановление не очищает существующие документы',()=>{
 const code=read('module/compendiums.mjs');
 assert.ok(code.includes('const candidates = data.filter'));
 assert.ok(!code.includes('Item.deleteDocuments('));
});
