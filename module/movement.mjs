// Movement rates depend on Dexterity, disciplines and wounds only.
// Carrying capacity and encumbrance mechanics are disabled in this build.
import { celerityLevel, celerityRawMode } from './discipline-effects.mjs';

// Movement (V20 p.258) - raw Dex for the base rates, plus flat Celerity yards
// per the DAV20 reading. Wolf form doubles the enhanced speed, Movement Burst
// (1 blood) multiplies speed by 1 + Celerity on top.
export function computeMovement(actor) {
  const sys = actor.system;
  const rawDex = sys.attributes?.dexterity || 0;
  // The flat yards and Movement Burst are the homebrew (DAV20) reading
  const cel = celerityRawMode() ? 0 : celerityLevel(actor);
  const burstMult = actor.getFlag('vtm-v20', 'celerityBurst') ? cel + 1 : 1;
  const wolfMult = actor.getFlag('vtm-v20', 'wolfForm') ? 2 : 1;
  let walk = (7 + cel) * burstMult * wolfMult,
      jog = (12 + rawDex + cel) * burstMult * wolfMult,
      run = (20 + (3 * rawDex) + cel) * burstMult * wolfMult;
  const hobble = 3;
  const crawl = 1;

  // Worst filled health level limits the pace (unless wounds are ignored)
  const keys = ['bruised', 'hurt', 'injured', 'wounded', 'mauled', 'crippled', 'incapacitated'];
  let worst = null;
  for (let i = keys.length - 1; i >= 0; i--) {
    if (sys.health.levels[keys[i]] > 0) { worst = keys[i]; break; }
  }
  let curLabel = 'Run', curValue = run;
  if (!actor.getFlag('vtm-v20', 'wpIgnoreWounds')) {
    switch (worst) {
      case 'incapacitated': curLabel = 'None'; curValue = 0; break;
      case 'crippled': curLabel = 'Crawl'; curValue = crawl; break;
      case 'mauled': curLabel = 'Hobble'; curValue = hobble; break;
      case 'wounded': curLabel = 'Walk'; curValue = walk; break;
      case 'injured': curLabel = 'Jog'; curValue = jog; break;
    }
  }

  // Token display: jog / run, both capped by what the wounds allow.
  // max stays at least 1 so the canvas bar math never divides by zero.
  const tokenMove = Math.min(curValue, jog);
  return {
    walk, jog, run, hobble, crawl, curLabel, curValue,
    current: { value: tokenMove, max: Math.max(curValue, 1) },
  };
}
