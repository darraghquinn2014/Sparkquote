import { describe, it, expect } from 'vitest';
import { seedMaterials } from '../seed/materials';
import { seedAssemblies, seedComponents, seedLaborToggles } from '../seed/assemblies';
import { toMaterial, toAssembly, toLaborToggle } from '../mappers';
import { materialLookupFrom, resolveAssemblyMaterialCost } from '../../domain/assembly';
import { addAssemblyToEstimate, lineFromAssembly, removeLine } from '../estimate-service';
import { priceEstimate } from '../../domain/pricing';
import type { Estimate } from '../../domain/types';

const materials = seedMaterials.map(toMaterial);
const lookup = materialLookupFrom(materials);
const assemblies = seedAssemblies.map((a) =>
  toAssembly(a, seedComponents.filter((c) => c.assembly_id === a.id)),
);
const toggles = seedLaborToggles.map(toLaborToggle);

describe('seed data integrity', () => {
  it('every assembly component references an existing material', () => {
    const ids = new Set(seedMaterials.map((m) => m.id));
    const orphans = seedComponents.filter((c) => !ids.has(c.material_id));
    expect(orphans).toEqual([]);
  });

  it('every assembly has at least one component', () => {
    for (const a of seedAssemblies) {
      const comps = seedComponents.filter((c) => c.assembly_id === a.id);
      expect(comps.length, `assembly ${a.id} has no components`).toBeGreaterThan(0);
    }
  });

  it('every seed assembly resolves to a positive material cost', () => {
    for (const a of assemblies) {
      expect(resolveAssemblyMaterialCost(a, lookup), a.name).toBeGreaterThan(0);
    }
  });

  it('material ids and skus are unique', () => {
    expect(new Set(seedMaterials.map((m) => m.id)).size).toBe(seedMaterials.length);
    expect(new Set(seedMaterials.map((m) => m.sku)).size).toBe(seedMaterials.length);
  });

  it('Quick-Quote tiles have icons and ranks', () => {
    for (const a of seedAssemblies) {
      expect(a.quick_quote_icon, a.name).toBeTruthy();
      expect(typeof a.quick_quote_rank).toBe('number');
    }
  });
});

describe('EstimateService through the engine', () => {
  function emptyDraft(): Estimate {
    return {
      id: 'e1', mode: 'quick', status: 'draft', currency: 'GBP',
      hourlyRateMinor: 5000, vatRatePct: 20, appliedLaborToggleIds: [], lineItems: [],
    };
  }

  it('lineFromAssembly snapshots the correct material cost', () => {
    const lightSwitch = assemblies.find((a) => a.id === 'asm_lightswitch_1g')!;
    const line = lineFromAssembly(lightSwitch, lookup);
    // sw1g 185 + bb25 100 + te15 5×1.1×75=412.5→413 + terminal 2×32=64 = 762
    expect(line.resolvedMaterialCostMinor).toBe(762);
    expect(line.laborBaseHours).toBe(0.5);
    expect(line.sourceAssemblyId).toBe('asm_lightswitch_1g');
  });

  it('tapping the same tile twice increments quantity, not rows', () => {
    const ls = assemblies.find((a) => a.id === 'asm_lightswitch_1g')!;
    let est = emptyDraft();
    est = addAssemblyToEstimate(est, ls, lookup);
    est = addAssemblyToEstimate(est, ls, lookup);
    expect(est.lineItems).toHaveLength(1);
    expect(est.lineItems[0]!.quantity).toBe(2);
  });

  it('different tiles add separate rows', () => {
    const ls = assemblies.find((a) => a.id === 'asm_lightswitch_1g')!;
    const dl = assemblies.find((a) => a.id === 'asm_downlight')!;
    let est = emptyDraft();
    est = addAssemblyToEstimate(est, ls, lookup);
    est = addAssemblyToEstimate(est, dl, lookup);
    expect(est.lineItems).toHaveLength(2);
  });

  it('a built estimate prices end-to-end through the engine', () => {
    const ls = assemblies.find((a) => a.id === 'asm_lightswitch_1g')!;
    let est = emptyDraft();
    est = addAssemblyToEstimate(est, ls, lookup);
    const priced = priceEstimate(est, toggles);
    // material 762 + labor 0.5h×£50=2500 = 3262; +20% VAT = 3914.4 → 3914
    expect(priced.lines[0]!.materialTotalMinor).toBe(762);
    expect(priced.lines[0]!.labor.costMinor).toBe(2500);
    expect(priced.subtotalMinor).toBe(3262);
    expect(priced.grandTotalMinor).toBe(3914);
  });

  it('removeLine drops the right row', () => {
    const ls = assemblies.find((a) => a.id === 'asm_lightswitch_1g')!;
    let est = emptyDraft();
    est = addAssemblyToEstimate(est, ls, lookup);
    const id = est.lineItems[0]!.id;
    est = removeLine(est, id);
    expect(est.lineItems).toHaveLength(0);
  });
});
