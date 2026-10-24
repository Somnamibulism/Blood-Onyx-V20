// Lightweight animated d10 fallback for Foundry V13 when Dice So Nice! is absent.
// Uses the already evaluated Roll. It never rolls a second time and never changes rules.
let animationQueue = Promise.resolve();

export function extractRolledDice(roll) {
  const terms = Array.isArray(roll?.dice) ? roll.dice : roll?.terms ?? [];
  return terms.flatMap(term => {
    if (!Number.isFinite(Number(term?.faces)) || !Array.isArray(term?.results)) return [];
    return term.results.filter(r => r?.active !== false && Number.isFinite(Number(r?.result)))
      .map(r => ({ faces: Number(term.faces), value: Number(r.result) }));
  });
}

function renderAnimation(roll) {
  const dice = extractRolledDice(roll);
  if (!dice.length || typeof document === 'undefined' || !document.body) return Promise.resolve();
  // Keep the overlay legible for unusually large V20 pools.
  const visible = dice.slice(0, 32);
  const over = Math.max(dice.length - visible.length, 0);
  const area = document.createElement('aside');
  area.className = 'vtm-animated-dice';
  area.setAttribute('aria-label', 'Визуализация броска кубиков');
  area.setAttribute('role', 'status');
  const heading = document.createElement('div');
  heading.className = 'vtm-animated-dice-title';
  heading.textContent = 'VAMPIRE: THE MASQUERADE · БРОСОК';
  area.append(heading);
  const tray = document.createElement('div');
  tray.className = 'vtm-animated-dice-tray';
  const tokens = visible.map(({ faces }, i) => {
    const token = document.createElement('div');
    token.className = `vtm-animated-die ${faces === 10 ? 'd10' : 'other'}`;
    token.style.setProperty('--dice-index', String(i));
    token.setAttribute('aria-label', `d${faces}`);
    token.textContent = '?';
    tray.append(token);
    return token;
  });
  if (over) {
    const remaining = document.createElement('span');
    remaining.className = 'vtm-animated-dice-overflow';
    remaining.textContent = `+${over}`;
    tray.append(remaining);
  }
  area.append(tray);
  document.body.append(area);
  return new Promise(resolve => {
    setTimeout(() => {
      tokens.forEach((token, i) => {
        const { value, faces } = visible[i];
        token.textContent = String(value);
        token.setAttribute('aria-label', `d${faces}: ${value}`);
        token.classList.add('settled');
        if (value === 1) token.classList.add('one');
        if (value === faces) token.classList.add('maximum');
      });
    }, 540);
    setTimeout(() => {
      area.classList.add('leaving');
      setTimeout(() => { area.remove(); resolve(); }, 190);
    }, 1280);
  });
}

export function showFallbackDice(roll) {
  // Serialize successive attack/damage/soak rolls instead of covering each other.
  const job = animationQueue.then(() => renderAnimation(roll));
  animationQueue = job.catch(error => console.warn('V20 RU | Визуализация броска', error));
  return job;
}
