/**
 * Basic electrician site tools: voltage drop and Ohm's law / power.
 *
 * Voltage drop mV/A/m reference values are the standard published copper
 * conductor figures (IET On-Site Guide style, PVC/T&E, 70°C). Treat them as
 * a quick site check, not a substitute for manufacturer cable data on
 * compliance-critical calculations.
 */

export type CableSize = '1.5' | '2.5' | '4' | '6' | '10' | '16' | '25' | '35';

export const CABLE_SIZES: CableSize[] = ['1.5', '2.5', '4', '6', '10', '16', '25', '35'];

/** Single-phase (loop) mV/A/m for copper conductors, PVC/T&E, 70°C. */
export const CABLE_MV_PER_A_PER_M: Record<CableSize, number> = {
  '1.5': 29,
  '2.5': 18,
  '4': 11,
  '6': 7.3,
  '10': 4.4,
  '16': 2.8,
  '25': 1.75,
  '35': 1.25,
};

export type Phase = 'single' | 'three';
export type VoltageDropLimit = 'lighting' | 'other';

const LIMIT_PERCENT: Record<VoltageDropLimit, number> = {
  lighting: 3,
  other: 5,
};

export interface VoltageDropInput {
  mVPerAPerM: number;
  currentA: number;
  lengthM: number;
  phase: Phase;
  supplyVoltage: number;
}

export interface VoltageDropResult {
  dropVolts: number;
  dropPercent: number;
  limitPercent: number;
  withinLimit: boolean;
}

/**
 * Three-phase volt drop from a single-phase (loop) mV/A/m table value:
 * the loop figure already doubles the per-conductor resistance for
 * single-phase go-and-return, so three-phase uses ×(√3/2) rather than ×√3.
 * Accurate for resistance-dominated small CSAs; reactance is negligible below ~16mm².
 */
const THREE_PHASE_FACTOR = Math.sqrt(3) / 2;

export function calculateVoltageDrop(
  input: VoltageDropInput,
  limit: VoltageDropLimit,
): VoltageDropResult {
  const { mVPerAPerM, currentA, lengthM, phase, supplyVoltage } = input;
  const multiplier = phase === 'three' ? THREE_PHASE_FACTOR : 1;
  const dropVolts = (mVPerAPerM * currentA * lengthM * multiplier) / 1000;
  const dropPercent = (dropVolts / supplyVoltage) * 100;
  const limitPercent = LIMIT_PERCENT[limit];
  return {
    dropVolts,
    dropPercent,
    limitPercent,
    withinLimit: dropPercent <= limitPercent,
  };
}

export interface OhmsLawKnowns {
  voltage?: number;
  current?: number;
  resistance?: number;
  power?: number;
}

export interface OhmsLawResult {
  voltage: number;
  current: number;
  resistance: number;
  power: number;
}

/**
 * Solves for whichever of V/I/R/P are missing given any two knowns.
 * Iterates a few passes since deriving one value can unlock another
 * (e.g. V+P gives I, which then gives R).
 */
export function solveOhmsLaw(knowns: OhmsLawKnowns): OhmsLawResult | null {
  const providedCount = [knowns.voltage, knowns.current, knowns.resistance, knowns.power]
    .filter((v) => v != null && Number.isFinite(v)).length;
  if (providedCount < 2) return null;

  let v = knowns.voltage;
  let i = knowns.current;
  let r = knowns.resistance;
  let p = knowns.power;

  for (let pass = 0; pass < 4; pass++) {
    if (v == null && i != null && r != null) v = i * r;
    if (v == null && p != null && i != null) v = p / i;
    if (v == null && p != null && r != null) v = Math.sqrt(p * r);

    if (i == null && v != null && r != null) i = v / r;
    if (i == null && p != null && v != null) i = p / v;
    if (i == null && p != null && r != null) i = Math.sqrt(p / r);

    if (r == null && v != null && i != null) r = v / i;
    if (r == null && v != null && p != null) r = (v * v) / p;
    if (r == null && p != null && i != null) r = p / (i * i);

    if (p == null && v != null && i != null) p = v * i;
    if (p == null && i != null && r != null) p = i * i * r;
    if (p == null && v != null && r != null) p = (v * v) / r;
  }

  if (v == null || i == null || r == null || p == null) return null;
  if (![v, i, r, p].every(Number.isFinite)) return null;

  return { voltage: v, current: i, resistance: r, power: p };
}
