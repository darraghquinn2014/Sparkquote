/**
 * Cable run estimation for a room.
 * Pure functions — no I/O, no framework imports. Easy to unit-test and delete.
 *
 * Formulas are rule-of-thumb, not engineering calculations:
 *   Ring main   = room perimeter × 1.15  (15% routing allowance) + CU feed + 3m tails
 *   Lighting    = (L+W) × 1.10           (10% ceiling routing)   + 2 switch drops + CU feed + 3m tails
 * All outputs are rounded UP to the nearest 0.5 m (practical for buying cable).
 * An optional safety buffer adds a further percentage on top (default 10%).
 */

export interface RoomDimensions {
  lengthM: number;
  widthM: number;
  heightM: number;
  /** Distance from this room to the consumer unit. 0 if unknown. */
  cuDistanceM: number;
}

export type CircuitType = 'ring' | 'lighting';

export interface CableRunResult {
  description: string;
  cableSpec: '2.5mm T+E' | '1.5mm T+E';
  metres: number;
}

export function calcCableRuns(
  dims: RoomDimensions,
  circuits: ReadonlySet<CircuitType>,
  safetyPct = 10,
): CableRunResult[] {
  const { lengthM: L, widthM: W, heightM: H, cuDistanceM: CU } = dims;
  const perim = 2 * (L + W);
  const buf = 1 + safetyPct / 100;
  const results: CableRunResult[] = [];

  if (circuits.has('ring')) {
    const raw = perim * 1.15 + CU * 1.1 + 3;
    results.push({
      description: 'Ring main sockets (2.5mm T+E)',
      cableSpec: '2.5mm T+E',
      metres: ceilHalf(raw * buf),
    });
  }

  if (circuits.has('lighting')) {
    const raw = (L + W) * 1.1 + H * 2 + CU * 1.1 + 3;
    results.push({
      description: 'Lighting circuit (1.5mm T+E)',
      cableSpec: '1.5mm T+E',
      metres: ceilHalf(raw * buf),
    });
  }

  return results;
}

function ceilHalf(n: number): number {
  return Math.ceil(n * 2) / 2;
}
