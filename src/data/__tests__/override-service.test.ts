import { describe, it, expect } from 'vitest';
import {
  setUnitCostOverride, clearUnitCostOverride,
  setMarkup, clearMarkup,
  addCustomLine, customLine,
  setQuantity,
  setLineToggle, setEstimateToggle,
} from '../override-service';
import { priceEstimate } from '../../domain/pricing';
import type { Estimate, LaborToggle, LineItem } from '../../domain/types';

const toggles: LaborToggle[] = [
  { id: 'tgl_height', label: 'Working Height', type: 'percentage', value: 0.15, appliesTo: 'line' },
  { id: 'tgl_ooh', label: 'Out of Hours', type: 'flatMultiplier', value: 1.5, appliesTo: 'estimate' },
];

function lineFromAssembly(over: Partial<LineItem> = {}): LineItem {
  return {
    id: 'l1', description: 'Light switch', sourceAssemblyId: 'a1',
    resolvedMaterialCostMinor: 900, laborBaseHours: 0.5, quantity: 1,
    appliedLaborToggleIds: [], ...over,
  };
}
function estimateWith(lines: LineItem[]): Estimate {
  return {
    id: 'e1', mode: 'quick', status: 'draft', currency: 'GBP',
    hourlyRateMinor: 5000, vatRatePct: 20, appliedLaborToggleIds: [], lineItems: lines,
  };
}

describe('unit cost override', () => {
  it('replaces the per-unit material cost', () => {
    const est = setUnitCostOverride(estimateWith([lineFromAssembly()]), 'l1', 500);
    expect(est.lineItems[0]!.overrides?.unitCostMinor).toBe(500);
    expect(priceEstimate(est, toggles).lines[0]!.materialTotalMinor).toBe(500);
  });

  it('CLEARS cleanly, reverting to the underlying price', () => {
    let est = setUnitCostOverride(estimateWith([lineFromAssembly()]), 'l1', 500);
    est = clearUnitCostOverride(est, 'l1');
    // overrides object should be gone entirely, price back to 900
    expect(est.lineItems[0]!.overrides).toBeUndefined();
    expect(priceEstimate(est, toggles).lines[0]!.materialTotalMinor).toBe(900);
  });

  it('rejects a negative unit cost', () => {
    expect(() => setUnitCostOverride(estimateWith([lineFromAssembly()]), 'l1', -1)).toThrow();
  });
});

describe('markup', () => {
  it('applies markup to materials only', () => {
    const est = setMarkup(estimateWith([lineFromAssembly()]), 'l1', 20);
    const b = priceEstimate(est, toggles).lines[0]!;
    expect(b.materialTotalMinor).toBe(1080); // 900 +20%
    expect(b.labor.costMinor).toBe(2500); // labour unchanged
  });

  it('combines with a unit cost override (override first, then markup)', () => {
    let est = setUnitCostOverride(estimateWith([lineFromAssembly()]), 'l1', 500);
    est = setMarkup(est, 'l1', 20);
    expect(priceEstimate(est, toggles).lines[0]!.materialTotalMinor).toBe(600); // 500 +20%
  });

  it('clearing markup but keeping unit cost leaves the override intact', () => {
    let est = setUnitCostOverride(estimateWith([lineFromAssembly()]), 'l1', 500);
    est = setMarkup(est, 'l1', 20);
    est = clearMarkup(est, 'l1');
    expect(est.lineItems[0]!.overrides).toEqual({ unitCostMinor: 500 });
    expect(priceEstimate(est, toggles).lines[0]!.materialTotalMinor).toBe(500);
  });

  it('rejects negative markup', () => {
    expect(() => setMarkup(estimateWith([lineFromAssembly()]), 'l1', -5)).toThrow();
  });
});

describe('custom line', () => {
  it('builds a custom one-off priced from its overrides', () => {
    const line = customLine({ name: 'Special bracket', costMinor: 1200, laborHours: 1 });
    expect(line.overrides?.isCustom).toBe(true);
    const est = estimateWith([line]);
    const b = priceEstimate(est, toggles).lines[0]!;
    expect(b.unitMaterialCostMinor).toBe(1200);
    expect(b.labor.costMinor).toBe(5000); // 1h × £50
  });

  it('adds a custom line to an estimate', () => {
    const est = addCustomLine(estimateWith([]), { name: 'Travel', costMinor: 0, laborHours: 2 });
    expect(est.lineItems).toHaveLength(1);
    expect(priceEstimate(est, toggles).lines[0]!.labor.costMinor).toBe(10000); // 2h × £50
  });

  it('rejects a negative custom cost', () => {
    expect(() => customLine({ name: 'x', costMinor: -1 })).toThrow();
  });
});

describe('quantity', () => {
  it('updates quantity and scales materials', () => {
    const est = setQuantity(estimateWith([lineFromAssembly()]), 'l1', 4);
    expect(priceEstimate(est, toggles).lines[0]!.materialSubtotalMinor).toBe(3600); // 900×4
  });
});

describe('labor toggles', () => {
  it('turns a line toggle on then off idempotently', () => {
    let est = setLineToggle(estimateWith([lineFromAssembly()]), 'l1', 'tgl_height', true);
    expect(est.lineItems[0]!.appliedLaborToggleIds).toEqual(['tgl_height']);
    // turning on again is a no-op (no duplicate)
    est = setLineToggle(est, 'l1', 'tgl_height', true);
    expect(est.lineItems[0]!.appliedLaborToggleIds).toEqual(['tgl_height']);
    est = setLineToggle(est, 'l1', 'tgl_height', false);
    expect(est.lineItems[0]!.appliedLaborToggleIds).toEqual([]);
  });

  it('line toggle affects the engine result', () => {
    const est = setLineToggle(estimateWith([lineFromAssembly()]), 'l1', 'tgl_height', true);
    const b = priceEstimate(est, toggles).lines[0]!;
    // 0.5h × 1.15 = 0.575h × £50 = 2875
    expect(b.labor.costMinor).toBe(2875);
  });

  it('estimate-wide toggle applies across all lines', () => {
    const est = setEstimateToggle(estimateWith([lineFromAssembly(), lineFromAssembly({ id: 'l2' })]), 'tgl_ooh', true);
    expect(est.appliedLaborToggleIds).toEqual(['tgl_ooh']);
    const priced = priceEstimate(est, toggles);
    // each line 0.5h × 1.5 = 0.75h × £50 = 3750
    expect(priced.lines[0]!.labor.costMinor).toBe(3750);
    expect(priced.lines[1]!.labor.costMinor).toBe(3750);
  });

  it('estimate toggle toggles off cleanly', () => {
    let est = setEstimateToggle(estimateWith([lineFromAssembly()]), 'tgl_ooh', true);
    est = setEstimateToggle(est, 'tgl_ooh', false);
    expect(est.appliedLaborToggleIds).toEqual([]);
  });
});
