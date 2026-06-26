/**
 * Money utilities (spec §1.4).
 *
 * All monetary values are integer MINOR units. Intermediate multipliers
 * (markup, waste, labor multipliers) are floats, so any operation that
 * produces fractional minor units MUST be rounded back to an integer at a
 * defined point — never left to accumulate drift.
 *
 * Rounding policy: half-up (round half away from zero) to the nearest minor
 * unit, applied at the points defined in pricing.ts.
 */

import type { MinorUnits } from './types';

/** Round a possibly-fractional minor-unit amount to a whole minor unit, half-up. */
export function roundMinor(amount: number): MinorUnits {
  if (!Number.isFinite(amount)) {
    throw new Error(`roundMinor received non-finite value: ${amount}`);
  }
  // Round half away from zero so 0.5 → 1 and -0.5 → -1 consistently.
  return Math.sign(amount) * Math.round(Math.abs(amount));
}

/** Multiply an integer minor amount by a float factor, returning rounded minor units. */
export function applyFactor(amountMinor: MinorUnits, factor: number): MinorUnits {
  return roundMinor(amountMinor * factor);
}

/** Sum a list of minor-unit amounts. Stays integer if inputs are integers. */
export function sumMinor(amounts: MinorUnits[]): MinorUnits {
  return amounts.reduce((acc, n) => acc + n, 0);
}

/**
 * Format minor units for display at the UI boundary only.
 * The engine never formats internally — it works in integers throughout.
 */
export function formatMoney(
  amountMinor: MinorUnits,
  currency: 'GBP' | 'EUR',
  locale: string = currency === 'GBP' ? 'en-GB' : 'en-IE',
): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
  }).format(amountMinor / 100);
}
