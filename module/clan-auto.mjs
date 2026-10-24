/** Automatically attach default in-clan Disciplines after a clan change.
 *  They start at 0 dots: V20 creation requires the player to spend 3 dots.
 *  Existing trained Disciplines are deliberately never deleted or reset.
 */
import { VTM } from './config.mjs';
import { canonicalName } from './ru/naming.mjs';
import { clanDisciplinesFor } from './clan-weaknesses.mjs';
import { DISCIPLINES } from './compendiums.mjs';

const pending = new Set();

export async function addClanDisciplines(actor, clanName) {
  if (!actor || actor.type !== 'vampire') return [];
  const names = clanDisciplinesFor(canonicalName(clanName), VTM.clanDisciplines);
  if (!names.length || pending.has(actor.uuid)) return [];
  pending.add(actor.uuid);
  try {
    const current = new Set(actor.items.filter(x => x.type === 'discipline')
      .map(x => canonicalName(x.name).toLowerCase()));
    const additions = [];
    const pack = game.packs?.get('vtm-v20.disciplines');
    let index = null;
    if (pack) {
      try { index = await pack.getIndex(); } catch (_) { /* use bundled source */ }
    }
    for (const rawName of names) {
      const name = canonicalName(rawName);
      if (current.has(name.toLowerCase())) continue;
      current.add(name.toLowerCase());
      // Prefer the live compendium, which may contain GM's authorized corrections.
      const entry = index?.find(x => canonicalName(x.name).toLowerCase() === name.toLowerCase());
      let data;
      if (entry) {
        try { data = (await pack.getDocument(entry._id))?.toObject(); } catch (_) { /* fallback */ }
      }
      if (!data) {
        const source = DISCIPLINES.find(x => x.name.toLowerCase() === name.toLowerCase());
        if (source) data = foundry.utils.deepClone(source);
      }
      if (!data) data = { name, type: 'discipline', system: { level: 0 } };
      delete data._id;
      // An Item embedded in an Actor must not inherit a compendium folder id.
      delete data.folder;
      data.system ||= {};
      data.system.level = 0;
      additions.push(data);
    }
    if (additions.length) await actor.createEmbeddedDocuments('Item', additions);
    return additions.map(x => x.name);
  } catch (err) {
    console.error('V20: failed to apply clan disciplines', err);
    ui.notifications.warn('Не удалось автоматически добавить дисциплины клана.');
    return [];
  } finally { pending.delete(actor.uuid); }
}

Hooks.on('updateActor', async (actor, changes, options, userId) => {
  if (options?.vtmSkipClanAuto || userId !== game.user.id || actor.type !== 'vampire') return;
  const next = changes?.system?.clan ?? changes?.['system.clan'];
  if (typeof next !== 'string' || !next) return;
  await addClanDisciplines(actor, next);
});
