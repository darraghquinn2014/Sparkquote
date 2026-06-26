import { describe, it, expect } from 'vitest';
import { computeDrift, applyRefresh } from '../recalculation';
import { materialLookupFrom } from '../assembly';
import type { Assembly, Estimate, LineItem, Material } from '../types';

// ── Catalogue & assembly ──────────────────────────────────────────────────
const cableOld: Material = { id: 'm3', sku: 'TE25', description: 'T&E 2.5mm', unit: 'm', unitCostMinor: 95, catalogueId: 'c1' };
const sw: Material = { id: 'm1', sku: 'SW1', description: 'Switch', unit: 'each', unitCostMinor: 250, catalogueId: 'c1' };
const bb: Material = { id: 'm2', sku: 'BB1', description: 'Backbox', unit: 'each', unitCostMinor: 180, catalogueId: 'c1' };

const lightSwitch: Assembly = {
  id: 'a1', name: '1-Way Light Switch', category: 'Lighting', baseLaborHours: 0.5,
  components: [
    { materialId: 'm1', quantity: 1 },
    { materialId: 'm2', quantity: 1 },
    { materialId: 'm3', quantity: 5 },
  ],
};
const assemblies = new Map([[lightSwitch.id, lightSwitch]]);

// Snapshot taken when the line was added: 250 + 180 + 95×5 = 905
function lineFromAssembly(over: Partial<LineItem> = {}): LineItem {
  return {
    id: 'l1', description: '1-Way Light Switch', sourceAssemblyId: 'a1',
    resolvedMaterialCostMinor: 905, laborBaseHours: 0.5, quantity: 1,
    appliedLaborToggleIds: [], ...over,
  };
}

function makeEstimate(status: Estimate['status'], lines: LineItem[]): Estimate {
  return {
    id: 'e1', mode: 'quick', status, currency: 'GBP', hourlyRateMinor: 5000,
    vatRatePct: 20, appliedLaborToggleIds: [], lineItems: lines,
  };
}

describe('Recalculation cascade (spec §5.4)', () => {
  // The headline scenario from the spec's Build risk note.
  it('THE scenario: import raises cable price → assembly rises → draft flags → sent frozen', () => {
    // A new wholesale import: cable jumps 95 → 120/m. New assembly cost:
    // 250 + 180 + 120×5 = 1030 (was 905, +125)
    const cableNew: Material = { ...cableOld, unitCostMinor: 120 };
    const lookup = materialLookupFrom([sw, bb, cableNew]);

    const draft = makeEstimate('draft', [lineFromAssembly()]);
    const sent = makeEstimate('sent', [lineFromAssembly({ id: 'l2' })]);

    // 1. Draft detects drift and is allowed to refresh
    const draftReport = computeDrift(draft, assemblies, lookup);
    expect(draftReport.refreshAllowed).toBe(true);
    expect(draftReport.drifts).toHaveLength(1);
    expect(draftReport.drifts[0]).toMatchObject({
      snapshotMinor: 905, liveMinor: 1030, deltaMinor: 125,
    });

    // 2. Sent estimate detects drift but is NOT allowed to refresh
    const sentReport = computeDrift(sent, assemblies, lookup);
    expect(sentReport.refreshAllowed).toBe(false);
    expect(sentReport.drifts).toHaveLength(1); // drift is reported as info only

    // 3. Applying refresh: draft updates, sent is returned untouched
    const refreshedDraft = applyRefresh(draft, assemblies, lookup);
    expect(refreshedDraft.lineItems[0]!.resolvedMaterialCostMinor).toBe(1030);

    const refreshedSent = applyRefresh(sent, assemblies, lookup);
    expect(refreshedSent).toBe(sent); // same reference: contract snapshot frozen
    expect(refreshedSent.lineItems[0]!.resolvedMaterialCostMinor).toBe(905);
  });

  it('no drift when prices are unchanged → estimate returned unchanged', () => {
    const lookup = materialLookupFrom([sw, bb, cableOld]);
    const draft = makeEstimate('draft', [lineFromAssembly()]);
    expect(computeDrift(draft, assemblies, lookup).drifts).toHaveLength(0);
    expect(applyRefresh(draft, assemblies, lookup)).toBe(draft);
  });

  it('signed estimates are frozen just like sent', () => {
    const cableNew: Material = { ...cableOld, unitCostMinor: 120 };
    const lookup = materialLookupFrom([sw, bb, cableNew]);
    const signed = makeEstimate('signed', [lineFromAssembly()]);
    expect(computeDrift(signed, assemblies, lookup).refreshAllowed).toBe(false);
    expect(applyRefresh(signed, assemblies, lookup)).toBe(signed);
  });

  it('never overrides a deliberate user override or custom item', () => {
    const cableNew: Material = { ...cableOld, unitCostMinor: 120 };
    const lookup = materialLookupFrom([sw, bb, cableNew]);
    const draft = makeEstimate('draft', [
      lineFromAssembly({ id: 'over', overrides: { unitCostMinor: 800 } }),
      lineFromAssembly({ id: 'cust', overrides: { isCustom: true, customCostMinor: 400 } }),
    ]);
    // Both lines are excluded from drift — the user's explicit price wins.
    expect(computeDrift(draft, assemblies, lookup).drifts).toHaveLength(0);
  });

  it('lines not backed by an assembly are ignored', () => {
    const lookup = materialLookupFrom([sw, bb, cableOld]);
    const { sourceAssemblyId, ...rest } = lineFromAssembly();
    const free: LineItem = { ...rest, id: 'free' };
    const draft = makeEstimate('draft', [free]);
    expect(computeDrift(draft, assemblies, lookup).drifts).toHaveLength(0);
  });
});
