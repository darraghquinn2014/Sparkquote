import { describe, it, expect } from 'vitest';
import { isLabourOnlyLine, materialLinesForLocation, formatMaterialLineSummary } from '../materials-query';
import type { LineItem } from '../types';

function line(overrides: Partial<LineItem> & { id: string; description: string }): LineItem {
  return {
    resolvedMaterialCostMinor: 0,
    laborBaseHours: 0,
    appliedLaborToggleIds: [],
    ...overrides,
  };
}

describe('isLabourOnlyLine', () => {
  it('is true for a custom labour line with hours', () => {
    expect(isLabourOnlyLine(line({ id: 'l1', description: 'Extra labour', overrides: { isCustom: true, customLaborHours: 2 } }))).toBe(true);
  });

  it('is true for a custom labour line with a flat amount', () => {
    expect(isLabourOnlyLine(line({ id: 'l1', description: 'Callout fee', overrides: { isCustom: true, customLaborFlatMinor: 5000 } }))).toBe(true);
  });

  it('is false for a plain material line', () => {
    expect(isLabourOnlyLine(line({ id: 'l1', description: 'Twin and Earth 2.5mm', quantityMeters: 20, resolvedMaterialCostMinor: 120 }))).toBe(false);
  });
});

describe('materialLinesForLocation', () => {
  const kitchenId = 'room-kitchen';
  const hallId = 'room-hall';
  const lines: LineItem[] = [
    line({ id: 'l1', description: 'Twin and Earth 2.5mm', quantityMeters: 20, resolvedMaterialCostMinor: 120, locationId: kitchenId }),
    line({ id: 'l2', description: 'Socket outlet', quantity: 3, resolvedMaterialCostMinor: 350, locationId: kitchenId }),
    line({ id: 'l3', description: 'Extra labour', overrides: { isCustom: true, customLaborHours: 2 }, locationId: kitchenId }),
    line({ id: 'l4', description: 'Light switch', quantity: 1, resolvedMaterialCostMinor: 200, locationId: hallId }),
    line({ id: 'l5', description: 'Unassigned item', quantity: 1, resolvedMaterialCostMinor: 100 }),
  ];

  it('returns only material lines for the given room, excluding other rooms and labour-only lines', () => {
    const result = materialLinesForLocation(lines, kitchenId);
    expect(result.map((l) => l.id)).toEqual(['l1', 'l2']);
  });

  it('returns an empty array when the room has no lines', () => {
    expect(materialLinesForLocation(lines, 'room-empty')).toEqual([]);
  });
});

describe('formatMaterialLineSummary', () => {
  it('formats a metres line with an "m" suffix', () => {
    expect(formatMaterialLineSummary(line({ id: 'l1', description: 'Twin and Earth 2.5mm', quantityMeters: 20 }))).toBe('Twin and Earth 2.5mm (20m)');
  });

  it('formats a discrete quantity line with a × prefix', () => {
    expect(formatMaterialLineSummary(line({ id: 'l1', description: 'Socket outlet', quantity: 3 }))).toBe('Socket outlet (×3)');
  });

  it('omits the quantity suffix when quantity is exactly 1', () => {
    expect(formatMaterialLineSummary(line({ id: 'l1', description: 'Light switch', quantity: 1 }))).toBe('Light switch');
  });

  it('omits the quantity suffix when neither quantity nor quantityMeters is set', () => {
    expect(formatMaterialLineSummary(line({ id: 'l1', description: 'Consumer unit' }))).toBe('Consumer unit');
  });
});
