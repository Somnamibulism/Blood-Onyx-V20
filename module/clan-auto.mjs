/** Synchronize clan Disciplines on an ordinary vampire sheet.
 *  Old clan-specific Disciplines are removed when the clan changes, even if
 *  dots were allocated. Shared clan Disciplines retain their dot ratings.
 *  Explicitly added out-of-clan Disciplines are kept.
 */
import { VTM } from './config.mjs';
import { canonicalName } from './ru/naming.mjs';
import { clanDisciplinesFor } from './clan-weaknesses.mjs';
import { DISCIPLINES } from './compendiums.mjs';

const pending = new Set();

export async function addClanDisciplines(actor, clanName) {
  if (!actor || actor.type !== 'vampire') return [];
  const names = clanDisciplinesFor(canonicalName(clanName), VTM.clanDisciplines);
  if (pending.has(actor.uuid)) return [];
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
      data.flags ||= {};
      data.flags['vtm-v20'] ||= {};
      data.flags['vtm-v20'].autoClan = true;
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

export async function syncClanDisciplines(actor, previousClan, nextClan) {
  if (!actor || actor.type !== 'vampire' || pending.has(actor.uuid)) return [];
  const previous = new Set(clanDisciplinesFor(canonicalName(previousClan), VTM.clanDisciplines).map(x => canonicalName(x).toLowerCase()));
  const next = new Set(clanDisciplinesFor(canonicalName(nextClan), VTM.clanDisciplines).map(x => canonicalName(x).toLowerCase()));
  const obsolete = Array.from(actor.items).filter(item => {
    if (item.type !== 'discipline') return false;
    const id = canonicalName(item.name).toLowerCase();
    // Marked auto-clan items also need cleanup for custom/edited clan data.
    return !next.has(id) && (previous.has(id) || item.flags?.['vtm-v20']?.autoClan === true);
  });
  if (obsolete.length) await actor.deleteEmbeddedDocuments('Item', obsolete.map(item => item.id || item._id));
  return addClanDisciplines(actor, nextClan);
}

Hooks.on('preUpdateActor', (actor, changes, options, userId) => {
  if (options?.vtmSkipClanAuto || userId !== game.user.id || actor.type !== 'vampire') return;
  if (typeof (changes?.system?.clan ?? changes?.['system.clan']) !== 'string') return;
  // Options are shared across pre/update events; no permanent Actor flag.
  options.vtmPreviousClan = actor.system.clan || '';
});

Hooks.on('updateActor', async (actor, changes, options, userId) => {
  if (options?.vtmSkipClanAuto || userId !== game.user.id || actor.type !== 'vampire') return;
  const next = changes?.system?.clan ?? changes?.['system.clan'];
  if (typeof next !== 'string') return;
  // preUpdateActor captures the previous clan before the Actor changes.
  const oldClan = options?.vtmPreviousClan;
  if (typeof oldClan !== 'string' || canonicalName(oldClan) === canonicalName(next)) return;
  await syncClanDisciplines(actor, oldClan, next);
});
