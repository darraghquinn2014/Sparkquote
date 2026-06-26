import { describe, it, expect } from 'vitest';
import {
  toMaterial, toAssembly, toLaborToggle, toLineItem, toEstimate,
  lineItemToRaw, parseIdArray, parseOverrides,
  type RawLineItem,
} from '../mappers';

describe('mappers', () => {
  it('maps a material row to domain', () => {
    const m = toMaterial({ id: 'm1', sku: 'X', description: 'd', unit: 'm', unit_cost_minor: 110, catalogue_id: 'c1' });
    expect(m).toEqual({ id: 'm1', sku: 'X', description: 'd', unit: 'm', unitCostMinor: 110, catalogueId: 'c1' });
  });

  it('maps an assembly with optional waste factors', () => {
    const a = toAssembly(
      { id: 'a1', name: 'A', category: 'C', base_labor_hours: 0.5 },
      [
        { id: 'c1', assembly_id: 'a1', material_id: 'm1', quantity: 1 },
        { id: 'c2', assembly_id: 'a1', material_id: 'm2', quantity: 5, waste_factor: 1.1 },
      ],
    );
    expect(a.components[0]).toEqual({ materialId: 'm1', quantity: 1 });
    expect(a.components[1]).toEqual({ materialId: 'm2', quantity: 5, wasteFactor: 1.1 });
  });

  it('maps and validates a labor toggle type', () => {
    const t = toLaborToggle({ id: 't1', label: 'L', toggle_type: 'percentage', value: 0.15, applies_to: 'line' });
    expect(t.type).toBe('percentage');
    expect(t.appliesTo).toBe('line');
  });

  it('rejects an invalid toggle type loudly', () => {
    expect(() => toLaborToggle({ id: 't1', label: 'L', toggle_type: 'bogus', value: 1, applies_to: 'line' })).toThrow();
  });

  describe('parseIdArray', () => {
    it('parses a JSON array', () => {
      expect(parseIdArray('["a","b"]')).toEqual(['a', 'b']);
    });
    it('treats null/empty as empty array', () => {
      expect(parseIdArray(null)).toEqual([]);
      expect(parseIdArray('')).toEqual([]);
    });
    it('rejects non-string-array JSON', () => {
      expect(() => parseIdArray('[1,2]')).toThrow();
    });
  });

  describe('parseOverrides', () => {
    it('returns undefined when absent', () => {
      expect(parseOverrides(null)).toBeUndefined();
    });
    it('parses an overrides object', () => {
      expect(parseOverrides('{"markupPct":20}')).toEqual({ markupPct: 20 });
    });
  });

  describe('line item round-trip (the risky JSON path)', () => {
    it('survives row → domain → row with overrides and toggles intact', () => {
      const raw: RawLineItem = {
        id: 'l1', source_assembly_id: 'a1', location_id: 'loc1',
        description: 'Switch', quantity: 3, quantity_meters: null,
        resolved_material_cost_minor: 905, labor_base_hours: 0.5,
        overrides_json: '{"markupPct":20,"unitCostMinor":800}',
        applied_labor_toggle_ids: '["tgl_height"]',
      };
      const domain = toLineItem(raw);
      expect(domain.overrides).toEqual({ markupPct: 20, unitCostMinor: 800 });
      expect(domain.appliedLaborToggleIds).toEqual(['tgl_height']);
      expect(domain.quantity).toBe(3);
      expect(domain.quantityMeters).toBeUndefined();

      const back = lineItemToRaw(domain, 'e1');
      expect(back.resolved_material_cost_minor).toBe(905);
      expect(JSON.parse(back.overrides_json!)).toEqual({ markupPct: 20, unitCostMinor: 800 });
      expect(JSON.parse(back.applied_labor_toggle_ids)).toEqual(['tgl_height']);
      expect(back.quantity_meters).toBeNull();
    });

    it('maps a linear containment line (metres, no discrete qty)', () => {
      const raw: RawLineItem = {
        id: 'l2', source_assembly_id: null, location_id: null,
        description: 'PVC trunking', quantity: null, quantity_meters: 12,
        resolved_material_cost_minor: 540, labor_base_hours: 0,
        overrides_json: null, applied_labor_toggle_ids: '[]',
      };
      const domain = toLineItem(raw);
      expect(domain.quantityMeters).toBe(12);
      expect(domain.quantity).toBeUndefined();
      expect(domain.sourceAssemblyId).toBeUndefined();
    });
  });

  it('maps a full estimate with lines', () => {
    const est = toEstimate(
      { id: 'e1', mode: 'quick', status: 'draft', currency: 'GBP', hourly_rate_minor: 5000, vat_rate_pct: 20, applied_labor_toggle_ids: '[]' },
      [{ id: 'l1', description: 'X', resolved_material_cost_minor: 100, labor_base_hours: 1, applied_labor_toggle_ids: '[]' }],
    );
    expect(est.mode).toBe('quick');
    expect(est.lineItems).toHaveLength(1);
  });
});
