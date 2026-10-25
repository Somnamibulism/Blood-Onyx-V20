/** Derived creation ratings per V20: Conscience + Self-Control = Humanity,
 * Courage = permanent Willpower. Path variants use the same paired slots.
 * Do not model permanent rating as current Willpower once play has started. */
const clamp = (value, min, max) => Math.min(max, Math.max(min, Math.trunc(Number(value) || 0)));

export function initialRatings(virtues) {
  return {
    humanity: clamp((virtues?.conscience ?? 1) + (virtues?.selfControl ?? 1), 0, 10),
    willpower: clamp(virtues?.courage ?? 1, 0, 10),
  };
}

/** Compute only the rating linked to the edited virtue. This avoids touching
 * unrelated ratings on existing characters. Temporary Willpower only changes
 * on creation (when it was full), or when the prior maximum is lowered below
 * the current temporary value. We never regenerate spent temporary points. */
/** Current permanent Willpower plus an explicit manual adjustment. The adjustment
 * survives a future Courage edit, while an explicit manual-mode toggle can
 * freeze the permanent rating independently of Courage. */
export function adjustedWillpower(courage, adjustment = 0) {
  return clamp(clamp(courage, 0, 5) + (Number(adjustment) || 0), 1, 10);
}

/** When the permanent rating rises, an unspent track rises with it; a spent
 * track keeps its current points, not a silent restoration of spent Willpower. */
export function willpowerRatingUpdate(system, nextMax) {
  const max = clamp(nextMax, 1, 10);
  const oldMax = clamp(system?.willpower?.max ?? 1, 1, 10);
  const oldValue = clamp(system?.willpower?.value ?? 1, 0, oldMax);
  return {
    'system.willpower.max': max,
    'system.willpower.value': oldValue >= oldMax ? max : Math.min(oldValue, max),
  };
}

/** A direct edit of permanent Willpower in AUTO mode is an adjustment,
 * not a request to break the derivation. Existing manual-mode characters
 * retain the old behaviour until their owner explicitly enables AUTO. */
export function manuallySetWillpower(system, next, manualMode = false) {
  const rating = clamp(next, 1, 10);
  const update = willpowerRatingUpdate(system, rating);
  if (!manualMode) {
    update['flags.vtm-v20.virtueWillpowerAdjustment'] = rating - clamp(system?.virtues?.courage ?? 1, 0, 5);
    update['flags.vtm-v20.virtueManualWillpower'] = false;
  }
  return update;
}

export function toggleWillpowerMode(system, currentlyManual = false) {
  if (currentlyManual) {
    // Keep a manually established total when reconnecting it to Courage.
    return {
      'flags.vtm-v20.virtueManualWillpower': false,
      'flags.vtm-v20.virtueWillpowerAdjustment':
        clamp(system?.willpower?.max ?? 1, 1, 10) - clamp(system?.virtues?.courage ?? 1, 0, 5),
    };
  }
  return {'flags.vtm-v20.virtueManualWillpower': true};
}

/** Compute only the rating linked to the edited virtue. This avoids touching
 * unrelated ratings on existing characters. */
export function updatesForVirtueClick(system, field, next, manualOverrides = {}) {
  const valid = new Set(['conscience', 'selfControl', 'courage']);
  if (!valid.has(field)) throw new Error(`Unknown virtue: ${field}`);
  const virtues = {
    conscience: system?.virtues?.conscience ?? 1,
    selfControl: system?.virtues?.selfControl ?? 1,
    courage: system?.virtues?.courage ?? 1,
    [field]: clamp(next, 0, 5),
  };
  const update = {[`system.virtues.${field}`]: virtues[field]};
  const ratings = initialRatings(virtues);
  if (field === 'courage' && !manualOverrides.willpower) {
    const nextRating = adjustedWillpower(ratings.willpower, manualOverrides.willpowerAdjustment ?? 0);
    Object.assign(update, willpowerRatingUpdate(system, nextRating));
  }
  if ((field === 'conscience' || field === 'selfControl') && !manualOverrides.humanity) {
    update['system.humanity'] = ratings.humanity;
  }
  return update;
}

/** Explicit recalculation button can restore both creation ratings. */
export function recalculateAllVirtues(system) {
  const {humanity, willpower} = initialRatings(system?.virtues);
  const oldMax = clamp(system?.willpower?.max ?? 1, 0, 10);
  const oldValue = clamp(system?.willpower?.value ?? 1, 0, 10);
  return {
    'system.humanity': humanity,
    'system.willpower.max': willpower,
    'system.willpower.value': oldValue >= oldMax ? willpower : Math.min(oldValue, willpower),
    'flags.vtm-v20.virtueManualWillpower': false,
    'flags.vtm-v20.virtueWillpowerAdjustment': 0,
    'flags.vtm-v20.virtueManualHumanity': false,
  };
}
