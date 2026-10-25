/**
 * V20 Russian wound-state display on token hover.
 * Read-only presentation of the existing 7-level/extended health track:
 * no health writes, Token flag changes, or combat mechanics.
 */
import { trackValues, countDamage } from './health-track.mjs';

const CONDITION_STEPS = Object.freeze([
  { label: 'Без ранений', className: 'clear', penalty: null },
  { label: 'Ушибы', className: 'bruised', penalty: 0 },
  { label: 'Легко ранен', className: 'hurt', penalty: -1 },
  { label: 'Ранен', className: 'injured', penalty: -1 },
  { label: 'Тяжело ранен', className: 'wounded', penalty: -2 },
  { label: 'Серьёзные увечья', className: 'mauled', penalty: -2 },
  { label: 'Искалечен', className: 'crippled', penalty: -5 },
  { label: 'Недееспособен', className: 'incapacitated', penalty: null },
]);

/** Return null for non-V20 actors or missing tracks. */
export function describeWoundState(actor) {
  if (!actor || !['vampire', 'mortal'].includes(actor.type)) return null;
  const health = actor.system?.health;
  if (!health?.levels) return null;

  const values = trackValues(actor.system);
  if (!values.length) return null;
  const damage = countDamage(actor.system);
  const remaining = values.filter(v => v === 0).length;
  const capacity = values.length;
  const extra = Array.isArray(health.extra) ? health.extra.length : 0;

  // V20's additional Bruised boxes precede Hurt. Use the deepest marked
  // box rather than effective woundPenalty (frenzy and powers suppress it).
  let lastMarked = values.findLastIndex(v => v > 0);
  let stage = 0;
  if (lastMarked >= 0) {
    if (lastMarked <= extra) stage = 1;
    else stage = Math.min(7, lastMarked - extra + 1);
  }

  return {
    ...CONDITION_STEPS[stage],
    remaining,
    capacity,
    taken: capacity - remaining,
    damage,
    values,
    stage,
  };
}

export function canViewExactHealth(token, user) {
  if (user?.isGM) return true;
  return !!(user && token?.actor?.testUserPermission?.(user, 'OWNER'));
}

export function isWoundTooltipAllowed(token, user) {
  if (!token?.actor || !user) return false;
  if (token.document?.hidden && !user.isGM) return false;
  // Foundry only fires hoverToken on interactable objects; retain an explicit
  // visibility guard for scene changes, refreshes and user permission updates.
  if (token.visible === false && !user.isGM) return false;
  return true;
}

/** Called only after Foundry has reached the ready hook. */
export function registerWoundTokenHover() {
  let hoveredToken = null;
  let tooltip = null;
  let latestPointer = null;

  function enabled() {
    try { return game.settings.get('vtm-v20', 'tokenWoundTooltip') !== false; }
    catch { return true; }
  }

  function clear() {
    hoveredToken = null;
    latestPointer = null;
    tooltip?.remove();
    tooltip = null;
    document.removeEventListener('pointermove', onPointerMove);
  }

  function makePart(tag, className, text) {
    const element = document.createElement(tag);
    element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function populate() {
    const token = hoveredToken;
    const state = describeWoundState(token?.actor);
    if (!state || !isWoundTooltipAllowed(token, game.user) || !enabled()) {
      clear();
      return;
    }

    if (!tooltip) {
      tooltip = document.createElement('div');
      tooltip.id = 'vtm-token-wound-tooltip';
      tooltip.setAttribute('role', 'status');
      tooltip.setAttribute('aria-live', 'off');
      document.body.appendChild(tooltip);
    }

    const exact = canViewExactHealth(token, game.user);
    tooltip.className = `vtm-token-wound-tooltip severity-${state.className}`;
    tooltip.replaceChildren();

    const head = makePart('div', 'wound-hover-title');
    head.appendChild(makePart('span', 'wound-hover-indicator'));
    head.appendChild(makePart('strong', 'wound-hover-label', state.label));
    tooltip.appendChild(head);

    if (exact) {
      const summary = makePart('div', 'wound-hover-summary');
      summary.appendChild(makePart('span', '', 'Здоровье'));
      summary.appendChild(makePart('b', 'wound-hover-count', `${state.remaining}/${state.capacity}`));
      tooltip.appendChild(summary);

      const boxes = makePart('div', 'wound-hover-track');
      for (const mark of state.values) {
        const cell = makePart('span', `wound-hover-box ${['empty', 'bashing', 'lethal', 'aggravated'][mark] || 'empty'}`);
        cell.title = ['Без повреждений', 'Ударный урон', 'Летальный урон', 'Аггравированный урон'][mark] || '';
        boxes.appendChild(cell);
      }
      tooltip.appendChild(boxes);

      if (state.taken > 0) {
        const parts = [];
        if (state.damage.bash) parts.push(`ударных: ${state.damage.bash}`);
        if (state.damage.leth) parts.push(`летальных: ${state.damage.leth}`);
        if (state.damage.agg) parts.push(`аггравированных: ${state.damage.agg}`);
        tooltip.appendChild(makePart('div', 'wound-hover-details', parts.join(' · ')));
      }
    }
    position();
  }

  function getTokenAnchor(token) {
    try {
      const view = canvas?.app?.canvas ?? canvas?.app?.view ?? canvas?.app?.renderer?.canvas;
      if (!view?.getBoundingClientRect) return null;
      const rect = view.getBoundingClientRect();
      const screen = canvas.app.renderer?.screen;
      const bounds = token.getBounds?.();
      if (!screen?.width || !screen?.height) return null;
      let bx = Number(bounds?.x ?? bounds?.minX);
      let by = Number(bounds?.y ?? bounds?.minY);
      let bw = Number(bounds?.width ?? ((bounds?.maxX ?? 0) - bx));
      if (![bx, by, bw].every(Number.isFinite)) {
        // Some PIXI/Foundry versions expose a Point instead of a bounds rect.
        const point = canvas.stage?.toGlobal?.(token.center);
        const top = canvas.stage?.toGlobal?.({ x: token.center?.x, y: token.document?.y ?? token.y });
        if (!point || !top) return null;
        bx = Number(point.x); by = Number(top.y); bw = 0;
        if (![bx, by].every(Number.isFinite)) return null;
      }
      return {
        x: rect.left + (bx + bw / 2) * rect.width / screen.width,
        y: rect.top + by * rect.height / screen.height - 8,
      };
    } catch { return null; }
  }

  function position() {
    if (!tooltip || !hoveredToken) return;
    const anchor = getTokenAnchor(hoveredToken)
      ?? (latestPointer ? { x: latestPointer.x, y: latestPointer.y - 18 } : null);
    if (!anchor) return;

    // Prefer above the token, then place below when the top edge would clip.
    const w = tooltip.offsetWidth || 180;
    const h = tooltip.offsetHeight || 68;
    const screenWidth = window.innerWidth || 1440;
    const screenHeight = window.innerHeight || 900;
    const x = Math.max(w / 2 + 8, Math.min(screenWidth - w / 2 - 8, anchor.x));
    let y = anchor.y - h - 6;
    if (y < 8) y = anchor.y + 14;
    y = Math.max(8, Math.min(screenHeight - h - 8, y));
    tooltip.style.left = `${Math.round(x - w / 2)}px`;
    tooltip.style.top = `${Math.round(y)}px`;
  }

  function onPointerMove(event) {
    latestPointer = { x: event.clientX, y: event.clientY };
    position();
  }

  Hooks.on('hoverToken', (token, hovered) => {
    if (!hovered) {
      if (hoveredToken === token) clear();
      return;
    }
    if (!enabled() || !isWoundTooltipAllowed(token, game.user) || !describeWoundState(token.actor)) return;
    clear();
    hoveredToken = token;
    document.addEventListener('pointermove', onPointerMove, { passive: true });
    populate();
  });

  // Health is synced after the combat engine writes. For unlinked tokens,
  // Foundry may update the synthetic Actor or the token's delta separately.
  Hooks.on('updateActor', (actor) => {
    if (hoveredToken && (hoveredToken.actor === actor || hoveredToken.actor?.id === actor.id)) populate();
  });
  Hooks.on('updateToken', (tokenDoc) => {
    if (hoveredToken && (hoveredToken.document === tokenDoc || hoveredToken.id === tokenDoc.id)) populate();
  });
  Hooks.on('refreshToken', (token) => {
    if (hoveredToken === token) position();
  });
  Hooks.on('canvasPan', () => position());
  Hooks.on('canvasReady', clear);
  Hooks.on('canvasTearDown', clear);
  Hooks.on('deleteToken', (tokenDoc) => {
    if (hoveredToken?.document === tokenDoc || hoveredToken?.id === tokenDoc.id) clear();
  });
}
