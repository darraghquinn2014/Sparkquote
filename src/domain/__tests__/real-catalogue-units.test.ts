/**
 * Regression fixture built from the actual distinct `unit` values in
 * Darragh's real imported catalogue (322 materials, pulled from the device
 * on 2026-07-25) — not the seed data. Every unit string that appears there
 * is checked here so a future regex tweak can't silently stop recognising
 * one of these without a test failing.
 */
import { describe, expect, it } from 'vitest';
import { drumLengthMeters } from '../drum-size';
import { packSize } from '../pack-size';

interface RealUnit {
  unit: string;
  /** How many materials in the real catalogue use this unit — documentation only. */
  count: number;
  expectedDrumLen: number | null;
  expectedPackSize: number | null;
}

const REAL_UNITS: RealUnit[] = [
  { unit: '100m drum', count: 30, expectedDrumLen: 100, expectedPackSize: null },
  { unit: '100m reel', count: 3, expectedDrumLen: 100, expectedPackSize: null },
  { unit: '2m length', count: 3, expectedDrumLen: 2, expectedPackSize: null },
  { unit: '3.75m length', count: 2, expectedDrumLen: 3.75, expectedPackSize: null },
  { unit: '305m box', count: 2, expectedDrumLen: 305, expectedPackSize: null },
  { unit: '3m length', count: 10, expectedDrumLen: 3, expectedPackSize: null },
  { unit: '50m coil', count: 1, expectedDrumLen: 50, expectedPackSize: null },
  { unit: '50m drum', count: 11, expectedDrumLen: 50, expectedPackSize: null },
  { unit: 'box 100', count: 5, expectedDrumLen: null, expectedPackSize: 100 },
  { unit: 'box 25', count: 1, expectedDrumLen: null, expectedPackSize: 25 },
  { unit: 'box 50', count: 1, expectedDrumLen: null, expectedPackSize: 50 },
  { unit: 'each', count: 189, expectedDrumLen: null, expectedPackSize: null },
  { unit: 'kit', count: 6, expectedDrumLen: null, expectedPackSize: null },
  { unit: 'm', count: 18, expectedDrumLen: null, expectedPackSize: null },
  { unit: 'pack', count: 6, expectedDrumLen: null, expectedPackSize: null },
  { unit: 'pack 10', count: 4, expectedDrumLen: null, expectedPackSize: 10 },
  { unit: 'pack 100', count: 7, expectedDrumLen: null, expectedPackSize: 100 },
  { unit: 'pack 5', count: 1, expectedDrumLen: null, expectedPackSize: 5 },
  { unit: 'pack 50', count: 1, expectedDrumLen: null, expectedPackSize: 50 },
  { unit: 'per metre', count: 16, expectedDrumLen: null, expectedPackSize: null },
  { unit: 'roll', count: 2, expectedDrumLen: null, expectedPackSize: null },
  { unit: 'tube', count: 3, expectedDrumLen: null, expectedPackSize: null },
];

describe('real catalogue unit strings', () => {
  it.each(REAL_UNITS)('"$unit" ($count materials) -> drum $expectedDrumLen, pack $expectedPackSize', (u) => {
    expect(drumLengthMeters(u.unit)).toBe(u.expectedDrumLen);
    // Mirrors how MaterialPicker/GlobalVoiceControl resolve pack size: only
    // checked once a drum length wasn't already found.
    const packResult = u.expectedDrumLen == null ? packSize(u.unit) : null;
    expect(packResult).toBe(u.expectedPackSize);
  });

  it('covers every unit actually present in the catalogue', () => {
    const totalMaterials = REAL_UNITS.reduce((sum, u) => sum + u.count, 0);
    expect(totalMaterials).toBe(322);
  });
});
