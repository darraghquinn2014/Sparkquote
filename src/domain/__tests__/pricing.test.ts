import { describe, it, expect } from 'vitest';
import { priceLine, priceEstimate, resolveToggles } from '../pricing';
import type { Estimate, LaborToggle, LineItem } from '../types';

const toggles: LaborToggle[] = [
  { id: 't_height', label: 'Working Height', type: 'percentage', value: 0.15, appliesTo: 'line' },
  { id: 't_ooh', label: 'Out of Hours', type: 'flatMultiplier', value: 1.5, appliesTo: 'estimate' },
];
const toggleIndex = new Map(toggles.map((t) => [t.id, t]));

function baseLine(over: Partial<LineItem> = {}): LineItem {
  return {
    id: 'l1',
    description: '1-Way Light Switch',
    sourceAssemblyId: 'a1',
    resolvedMaterialCostMinor: 905,
    laborBaseHours: 0.5,
    quantity: 1,
    appliedLaborToggleIds: [],
    ...over,
  };
}

describe('priceLine', () => {
  it('prices a simple line: material + labor, no markup or toggles', () => {
    // material 905 × 1 = 905; labor 0.5h × £50 = 2500; total 3405
    const r = priceLine(baseLine(), 5000, toggleIndex, []);
    expect(r.materialTotalMinor).toBe(905);
    expect(r.labor.costMinor).toBe(2500);
    expect(r.lineTotalMinor).toBe(3405);
  });

  it('applies quantity to materials', () => {
    const r = priceLine(baseLine({ quantity: 3 }), 5000, toggleIndex, []);
    expect(r.materialSubtotalMinor).toBe(2715); // 905×3
  });

  it('ORDER: markup applies to materials only, not labor', () => {
    // material 905 +20% = 1086; labor unaffected 2500; total 3586
    const r = priceLine(baseLine({ overrides: { markupPct: 20 } }), 5000, toggleIndex, []);
    expect(r.materialTotalMinor).toBe(1086);
    expect(r.markupAmountMinor).toBe(181);
    expect(r.labor.costMinor).toBe(2500);
    expect(r.lineTotalMinor).toBe(3586);
  });

  it('OVERRIDE: a unit cost override replaces the resolved material cost', () => {
    const r = priceLine(baseLine({ overrides: { unitCostMinor: 500 } }), 5000, toggleIndex, []);
    expect(r.unitMaterialCostMinor).toBe(500);
    expect(r.materialTotalMinor).toBe(500);
  });

  it('CUSTOM: a one-off custom item uses its own cost and labor', () => {
    const { sourceAssemblyId, ...rest } = baseLine();
    const line: LineItem = {
      ...rest,
      overrides: { isCustom: true, customName: 'Special bracket', customCostMinor: 1200, customLaborHours: 1 },
    };
    const r = priceLine(line, 5000, toggleIndex, []);
    expect(r.unitMaterialCostMinor).toBe(1200);
    expect(r.labor.costMinor).toBe(5000); // 1h × £50
    expect(r.lineTotalMinor).toBe(6200);
  });

  it('LINEAR: containment uses quantityMeters', () => {
    const { quantity, ...rest } = baseLine();
    const trunking: LineItem = {
      ...rest,
      description: '50mm PVC trunking',
      quantityMeters: 12,
      resolvedMaterialCostMinor: 320, // per metre
      laborBaseHours: 0,
    };
    const r = priceLine(trunking, 5000, toggleIndex, []);
    expect(r.effectiveQuantity).toBe(12);
    expect(r.materialTotalMinor).toBe(3840); // 320×12
  });

  it('applies line + estimate toggles together', () => {
    const line = baseLine({ appliedLaborToggleIds: ['t_height'] });
    // labor 0.5h × (1.15) × 1.5 = 0.8625h × £50 = 4312.5 → 4313
    const r = priceLine(line, 5000, toggleIndex, ['t_ooh']);
    expect(r.labor.costMinor).toBe(4313);
  });
});

describe('resolveToggles', () => {
  it('only applies estimate toggles at estimate scope and line toggles at line scope', () => {
    // t_height is line-scoped: it should NOT apply if passed as estimate-wide
    const asEstimate = resolveToggles([], ['t_height'], toggleIndex);
    expect(asEstimate).toHaveLength(0);
    // t_ooh is estimate-scoped: should NOT apply if passed as a line toggle
    const asLine = resolveToggles(['t_ooh'], [], toggleIndex);
    expect(asLine).toHaveLength(0);
  });

  it('ignores unknown toggle ids defensively', () => {
    expect(resolveToggles(['ghost'], ['ghost2'], toggleIndex)).toHaveLength(0);
  });
});

describe('priceEstimate', () => {
  const estimate: Estimate = {
    id: 'e1',
    mode: 'quick',
    status: 'draft',
    currency: 'GBP',
    hourlyRateMinor: 5000,
    vatRatePct: 20,
    appliedLaborToggleIds: [],
    lineItems: [
      baseLine({ id: 'l1' }),                 // 3405
      baseLine({ id: 'l2', quantity: 2 }),    // material 1810 + labor 2500 = 4310
    ],
  };

  it('sums lines and applies VAT', () => {
    const r = priceEstimate(estimate, toggles);
    expect(r.subtotalMinor).toBe(3405 + 4310); // 7715
    expect(r.vatAmountMinor).toBe(1543); // 7715 × 20%
    expect(r.grandTotalMinor).toBe(9258);
  });

  it('zero VAT rate produces no VAT line', () => {
    const r = priceEstimate({ ...estimate, vatRatePct: 0 }, toggles);
    expect(r.vatAmountMinor).toBe(0);
    expect(r.grandTotalMinor).toBe(r.subtotalMinor);
  });
});
