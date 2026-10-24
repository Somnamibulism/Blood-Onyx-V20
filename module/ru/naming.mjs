import {names} from './data.mjs';
import {extraNames} from './extra.mjs';
import {lexicon} from './lexicon.mjs';
// Названия из ru.4 (старые листы персонажей). Всегда распознаём их,
// даже если новое отображение ориентируется на термины русской V20.
const legacyNames = Object.fromEntries(Object.entries({
  'Прорицание':'Auspex', 'Химерия':'Chimerstry', 'Затемнение':'Obfuscate',
  'Власть над Тенью':'Obtenebration', 'Могущество':'Potence',
  'Присутствие':'Presence', 'Превращение':'Protean',
  'Смертоносность':'Quietus', 'Изменчивость':'Vicissitude',
}).map(([text,id])=>[text.toLowerCase(),id]));
export function displayName(value) {return names[value] || extraNames[value] || lexicon[value] || value;}
let reverse, keyCount=-1;
export function canonicalName(value) {
  if(value==null)return '';
  const count=Object.keys(names).length+Object.keys(extraNames).length+Object.keys(lexicon).length;
  if(count!==keyCount){
    reverse=new Map();
    for(const table of [names,extraNames,lexicon])for(const[key,ru]of Object.entries(table))if(!reverse.has(ru.toLowerCase()))reverse.set(ru.toLowerCase(),key);
    keyCount=count;
  }
  const text=String(value);return legacyNames[text.toLowerCase()] || reverse.get(text.toLowerCase())||text;
}
// Keep user-entered titles intact; only known shipped titles are translated.
export function russianDocument(data) {
  const clone=structuredClone(data);clone.name=displayName(clone.name);
  for(const field of ['powers','levels']) for(const p of Object.values(clone.system?.[field]||{})) if(p.name)p.name=displayName(p.name);
  return clone;
}
