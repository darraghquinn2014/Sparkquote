import { describe, it, expect } from 'vitest';
import { computeLabor, composeLaborMultiplier } from '../labor';
import type { LaborToggle } from '../types';

const workingHeight: LaborToggle = { id: 't1', label: 'High Working Height', type: 'percentage', value: 0.15, appliesTo: 'line' };
const outOfHours: LaborToggle = { id: 't2', label: 'Night / Out-of-Hours', type: 'flatMultiplier', value: 1.5, appliesTo: 'estimate' };
const occupied: LaborToggle = { id: 't3', label: 'Occupied Commercial Premises', type: 'timeBuffer', value: 0.10, appliesTo: 'estimate' };

describe('LaborEngine', () => {
  it('returns base hours unchanged with no toggles', () => {
    const r = computeLabor(2, 5000, []); // 2h × £50.00/h = £100.00
    expect(r.hours).toBe(2);
    expect(r.costMinor).toBe(10000);
    expect(r.effectiveMultiplier).toBe(1);
  });

  it('applies a single percentage toggle (+15%)', () => {
    expect(composeLaborMultiplier([workingHeight])).toBeCloseTo(1.15);
  });

  it('applies a single flat multiplier (×1.5)', () => {
    expect(composeLaborMultiplier([outOfHours])).toBeCloseTo(1.5);
  });

  it('COMPOSITION: percentages add within group, flats multiply, groups multiply', () => {
    // (1 + 0.15) × 1.5 × (1 + 0.10) = 1.15 × 1.5 × 1.10 = 1.8975
    const m = composeLaborMultiplier([workingHeight, outOfHours, occupied]);
    expect(m).toBeCloseTo(1.8975, 4);
  });

  it('two percentage toggles ADD rather than compound', () => {
    const extraPct: LaborToggle = { id: 't4', label: 'Extra', type: 'percentage', value: 0.10, appliesTo: 'line' };
    // (1 + 0.15 + 0.10) = 1.25, NOT 1.15×1.10
    expect(composeLaborMultiplier([workingHeight, extraPct])).toBeCloseTo(1.25);
  });

  it('two flat multipliers MULTIPLY', () => {
    const double: LaborToggle = { id: 't5', label: 'Double', type: 'flatMultiplier', value: 2, appliesTo: 'estimate' };
    // 1.5 × 2 = 3
    expect(composeLaborMultiplier([outOfHours, double])).toBeCloseTo(3);
  });

  it('computes cost and rounds to the penny', () => {
    // base 1h, rate £50.00, ×1.8975 = 1.8975h → 9487.5 → 9488
    const r = computeLabor(1, 5000, [workingHeight, outOfHours, occupied]);
    expect(r.costMinor).toBe(9488);
  });

  it('rejects negative base hours', () => {
    expect(() => computeLabor(-1, 5000, [])).toThrow();
  });
});
