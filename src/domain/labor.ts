/**
 * LaborEngine (spec §7).
 *
 * Final labor for a line:
 *
 *   laborHours = baseHours
 *              × (1 + Σ percentage toggles)    // e.g. working height +15%
 *              × Π flatMultiplier toggles        // e.g. out-of-hours ×1.5
 *              × (1 + Σ timeBuffer toggles)       // e.g. occupied premises +10%
 *   laborCost  = round(laborHours × hourlyRateMinor)
 *
 * Composition rule (a DELIBERATE, tested choice per the spec's Build risk note):
 *   - 'percentage' toggles ADD within their group.
 *   - 'timeBuffer' toggles ADD within their group.
 *   - 'flatMultiplier' toggles MULTIPLY together.
 *   - the three groups then multiply.
 *
 * Toggles applied to a line are the union of that line's own toggles and the
 * estimate-wide toggles. The caller resolves which apply; this module just
 * composes a given set.
 */

import type { LaborToggle, MinorUnits } from './types';
import { roundMinor } from './money';

export interface LaborResult {
  /** Effective labor hours after all multipliers. */
  hours: number;
  /** Labor cost in minor units. */
  costMinor: MinorUnits;
  /** Combined multiplier applied to base hours (for transparency/UI). */
  effectiveMultiplier: number;
}

/** Combine a set of toggles into a single multiplier on base hours. */
export function composeLaborMultiplier(toggles: LaborToggle[]): number {
  let percentageSum = 0;
  let bufferSum = 0;
  let flatProduct = 1;

  for (const t of toggles) {
    switch (t.type) {
      case 'percentage':
        percentageSum += t.value;
        break;
      case 'timeBuffer':
        bufferSum += t.value;
        break;
      case 'flatMultiplier':
        flatProduct *= t.value;
        break;
      default: {
        // Exhaustiveness guard — if a new toggle type is added without
        // handling, this throws rather than silently mispricing.
        const _exhaustive: never = t.type;
        throw new Error(`Unhandled labor toggle type: ${_exhaustive}`);
      }
    }
  }

  return (1 + percentageSum) * flatProduct * (1 + bufferSum);
}

/** Compute labor hours and cost for a line. */
export function computeLabor(
  baseHours: number,
  hourlyRateMinor: MinorUnits,
  toggles: LaborToggle[],
): LaborResult {
  if (baseHours < 0) {
    throw new Error(`baseHours cannot be negative: ${baseHours}`);
  }
  const multiplier = composeLaborMultiplier(toggles);
  const hours = baseHours * multiplier;
  return {
    hours,
    costMinor: roundMinor(hours * hourlyRateMinor),
    effectiveMultiplier: multiplier,
  };
}
