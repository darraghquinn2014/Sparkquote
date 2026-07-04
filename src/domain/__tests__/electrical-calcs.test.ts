import { describe, it, expect } from 'vitest';
import { calculateVoltageDrop, solveOhmsLaw, CABLE_MV_PER_A_PER_M } from '../electrical-calcs';

describe('calculateVoltageDrop', () => {
  it('computes single-phase drop within limit', () => {
    // 2.5mm² (18 mV/A/m), 20A, 15m run, 230V supply
    const result = calculateVoltageDrop(
      { mVPerAPerM: CABLE_MV_PER_A_PER_M['2.5'], currentA: 20, lengthM: 15, phase: 'single', supplyVoltage: 230 },
      'other',
    );
    // (18 * 20 * 15) / 1000 = 5.4V
    expect(result.dropVolts).toBeCloseTo(5.4, 5);
    expect(result.dropPercent).toBeCloseTo((5.4 / 230) * 100, 5);
    expect(result.limitPercent).toBe(5);
    expect(result.withinLimit).toBe(true);
  });

  it('flags a drop that breaches the lighting limit (3%)', () => {
    // 1.5mm² (29 mV/A/m), 10A, 30m run — a large drop
    const result = calculateVoltageDrop(
      { mVPerAPerM: CABLE_MV_PER_A_PER_M['1.5'], currentA: 10, lengthM: 30, phase: 'single', supplyVoltage: 230 },
      'lighting',
    );
    // (29 * 10 * 30) / 1000 = 8.7V -> 3.78%
    expect(result.dropVolts).toBeCloseTo(8.7, 5);
    expect(result.limitPercent).toBe(3);
    expect(result.withinLimit).toBe(false);
  });

  it('applies the three-phase factor (√3/2) relative to single-phase', () => {
    const single = calculateVoltageDrop(
      { mVPerAPerM: 10, currentA: 20, lengthM: 25, phase: 'single', supplyVoltage: 230 },
      'other',
    );
    const three = calculateVoltageDrop(
      { mVPerAPerM: 10, currentA: 20, lengthM: 25, phase: 'three', supplyVoltage: 400 },
      'other',
    );
    expect(three.dropVolts).toBeCloseTo(single.dropVolts * (Math.sqrt(3) / 2), 10);
  });
});

describe('solveOhmsLaw', () => {
  it('solves from V and I', () => {
    const result = solveOhmsLaw({ voltage: 230, current: 10 });
    expect(result).not.toBeNull();
    expect(result!.resistance).toBeCloseTo(23, 5);
    expect(result!.power).toBeCloseTo(2300, 5);
  });

  it('solves from P and I', () => {
    const result = solveOhmsLaw({ power: 2300, current: 10 });
    expect(result).not.toBeNull();
    expect(result!.voltage).toBeCloseTo(230, 5);
    expect(result!.resistance).toBeCloseTo(23, 5);
  });

  it('solves from P and R', () => {
    const result = solveOhmsLaw({ power: 2300, resistance: 23 });
    expect(result).not.toBeNull();
    expect(result!.current).toBeCloseTo(10, 5);
    expect(result!.voltage).toBeCloseTo(230, 5);
  });

  it('solves from V and R', () => {
    const result = solveOhmsLaw({ voltage: 230, resistance: 23 });
    expect(result).not.toBeNull();
    expect(result!.current).toBeCloseTo(10, 5);
    expect(result!.power).toBeCloseTo(2300, 5);
  });

  it('returns null with fewer than two knowns', () => {
    expect(solveOhmsLaw({ voltage: 230 })).toBeNull();
    expect(solveOhmsLaw({})).toBeNull();
  });

  it('returns null for a degenerate combination (division by zero)', () => {
    expect(solveOhmsLaw({ voltage: 230, current: 0 })).toBeNull();
  });
});
