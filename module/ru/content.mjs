import {weaponNotes} from './weapon-notes.mjs';
import {backgroundLevels} from './background-levels.mjs';
import { DISCIPLINES, BACKGROUNDS, MERITS, FLAWS, WEAPONS, ARMOR } from '../compendiums.mjs';
import { PATHS } from '../paths-data.mjs';
import { RITUALS } from '../rituals-data.mjs';
import { ARCHETYPES } from '../archetypes-data.mjs';
import { TRAIT_DESCRIPTIONS } from '../trait-descriptions.mjs';
import { CLAN_WEAKNESSES } from '../clan-weaknesses.mjs';
import { VTM } from '../config.mjs';
import { lexicon, addEntries, translateText } from './lexicon.mjs';
import { extraNames, weaknesses, archetypeCues } from './extra.mjs';
import { content, names } from './data.mjs';
import { disciplineGuide, passiveDisciplines } from './discipline-guides.mjs';

addEntries(Object.entries(extraNames));
addEntries(Object.entries(names).filter(([key])=>!Object.hasOwn(lexicon,key)));
Object.assign(CLAN_WEAKNESSES, weaknesses);
// Exclude the author's custom magical weapons from the vanilla catalogs.
const customStart = WEAPONS.findIndex(it=>it.name==='Blessed Macuahuitl');
if(customStart>=0) WEAPONS.splice(customStart);
export const catalogs = {DISCIPLINES,BACKGROUNDS,MERITS,FLAWS,WEAPONS,ARMOR,PATHS,RITUALS};
export {displayName, canonicalName} from './naming.mjs';
import {displayName, canonicalName} from './naming.mjs';
const escapeHTML=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function localizeCatalogs() {
  for(const group of Object.values(catalogs)) for(const item of group) {
    const translated=content[item.name];
    if(translated?.description) item.system.description=`<p>${escapeHTML(translated.description)}</p>`;
    if(item.type==='weapon') {
      const s=item.system;
      s.description=`<p>${escapeHTML(weaponNotes[item.name] || displayName(item.name))}</p><p>Параметры и боезапас указаны в карточке. Для атаки отметь цель и используй вкладку «Бой».</p>`;
    }
    if(item.type==='armor') item.system.description=`<p>${escapeHTML(displayName(item.name))}. Добавляет ${item.system.rating} куб. поглощения, штраф Ловкости ${item.system.penalty}. Нужно надеть предмет. Обычная броня не защищает от огня и солнечного света.</p>`;
    for(const [key,power] of Object.entries(item.system.powers||{})) {
      const tr=translated?.powers?.[power.name];
      if(tr) power.desc=`<p>${escapeHTML(tr.description)}</p>`;
      if(item.type==='discipline') {
        const level=Number(key.replace('lvl',''));
        const note=disciplineGuide(item.name,level);
        if(note) {
          // A second paragraph explains the use of each dot in everyday play.
          power.desc += `<p><b>Пример и границы:</b> ${escapeHTML(note)}</p>`;
          if(passiveDisciplines.has(item.name)) power.desc = `<p><b>Уровень ${level}:</b> ${escapeHTML(note)}</p>`;
        }
      }
      if(!power.name && item.type==='path') {
        const n=Number(key.replace('lvl',''));
        power.name=`${item.name} ${n}`;
        names[power.name]=`${displayName(item.name)} · ${n}`;
        power.desc=item.system.description;
      }
    }
    if(item.type==='discipline') item.system.description += '<p><b>Памятка:</b> открой «Описание уровней» в листе персонажа, чтобы узнать, что даёт каждая новая точка. Затраты и броски указаны в карточках отдельных сил; они не заменяют решение рассказчицы.</p>';
    // Russian generic Background levels; retain their numeric values.
    for(const [key,level] of Object.entries(item.system.levels||{})) {
      const n=Number(key.replace('lvl',''));
      names[level.name] ||= `Уровень ${n}`;
      level.desc=`<p>${escapeHTML(backgroundLevels[item.name]?.[n-1] || `${displayName(item.name)}: ${n} из 5.`)}</p>`;
    }
  }
  DISCIPLINES.find(d=>d.name==='Animalism').system.powers.lvl3.difficulty=7;
  DISCIPLINES.find(d=>d.name==='Dementation').system.powers.lvl3.difficulty=7;
  DISCIPLINES.find(d=>d.name==='Serpentis').system.powers.lvl1.difficulty=9;
  DISCIPLINES.find(d=>d.name==='Serpentis').system.powers.lvl2.cost='1 blood';
  const possession=DISCIPLINES.find(d=>d.name==='Dominate').system.powers.lvl5;
  possession.primary='attributes.charisma'; possession.secondary='abilities.intimidation'; possession.difficulty=7; possession.cost='1 Willpower';
  const conjuring=PATHS.find(p=>p.name==='The Path of Conjuring').system.powers;
  conjuring.lvl2.cost='3 blood';conjuring.lvl3.cost='5 blood';conjuring.lvl5.cost='10 blood';
  PATHS.find(p=>p.name==="Neptune's Might").system.powers.lvl4.cost='1 blood + 3 WP';
  for(const [i,name] of VTM.natures.entries()) {
    const [body,regain]=archetypeCues[i].split('|');ARCHETYPES[name]=`${body}\n\n• ${regain}`;
  }
  const ratings=['Слабо','Обычно','Хорошо','Исключительно','Выдающийся уровень'];
  for(const [path,levels] of Object.entries(TRAIT_DESCRIPTIONS)) {
    const key=path.split('.').pop();const label=lexicon[key[0].toUpperCase()+key.slice(1)]||displayName(key);
    TRAIT_DESCRIPTIONS[path]=levels.map((_,i)=>`${label}: ${i+1} — ${ratings[Math.min(i,4)]}.`);
  }
  // Correct shorthand terms in hand-authored notes.
  for(const group of Object.values(catalogs)) for(const it of group) {
    it.system.description=it.system.description?.replaceAll('Харизма','Обаяние').replaceAll('Храбрость','Смелость');
    for(const power of Object.values(it.system.powers||{})) power.desc=power.desc?.replaceAll('Харизма','Обаяние').replaceAll('Храбрость','Смелость');
  }
}
localizeCatalogs();
export const clanDocuments=VTM.clans.map(name=>({
  name,type:'clan',img:'icons/svg/mystery-man.svg',system:{
    disciplines:[...(VTM.clanDisciplines[name]||[])],weakness:weaknesses[name],
    description:`<p><b>${escapeHTML(displayName(name))}</b></p><p>Дисциплины: ${(VTM.clanDisciplines[name]||[]).map(displayName).join(', ')||'выбираются индивидуально'}.</p><p>${escapeHTML(weaknesses[name])}</p><p>Секта выбирается в листе отдельно от клана. Для антитрибу с измененными дисциплинами создай отдельный клановый предмет; стандартная карточка не меняет родословную автоматически.</p>`
  }
}));
