import { describe, it, expect } from 'vitest';
import {
  containmentLine,
  addProjectLine,
  assignToLocation,
  setMeters,
  linesAtLocation,
} from '../project-service';
import { seedMaterials } from '../seed/materials';
import { toMaterial } from '../mappers';
import { priceEstimate } from '../../domain/pricing';
import { buildLocationTree, rollUpTotals } from '../../domain/location';
import type { Estimate, Location, Material } from '../../domain/types';

const materials = seedMaterials.map(toMaterial);
const pvcTrunking = materials.find((m) => m.id === 'mat_trunk_pvc50')!; // 480/m
const tray = materials.find((m) => m.id === 'mat_tray_med')!; // 1350/m

function emptyProjectEstimate(): Estimate {
  return {
    id: 'e1', mode: 'project', status: 'draft', currency: 'GBP',
    hourlyRateMinor: 5000, vatRatePct: 20, appliedLaborToggleIds: [], lineItems: [],
  };
}

describe('containmentLine', () => {
  it('prices per metre with a snapshot of the per-metre cost', () => {
    const line = containmentLine(pvcTrunking, 12, 'recep');
    expect(line.quantityMeters).toBe(12);
    expect(line.resolvedMaterialCostMinor).toBe(480);
    expect(line.locationId).toBe('recep');
    expect(line.quantity).toBeUndefined();
  });

  it('rejects negative metres', () => {
    expect(() => containmentLine(pvcTrunking, -1, 'recep')).toThrow();
  });

  it('prices correctly through the engine: 12m × 480 = 5760', () => {
    let est = emptyProjectEstimate();
    est = addProjectLine(est, containmentLine(pvcTrunking, 12, 'recep'));
    const priced = priceEstimate(est, []);
    expect(priced.lines[0]!.materialTotalMinor).toBe(5760);
    expect(priced.subtotalMinor).toBe(5760);
  });
});

describe('setMeters', () => {
  it('updates the metre count immutably', () => {
    let est = emptyProjectEstimate();
    est = addProjectLine(est, containmentLine(tray, 5, 'server'));
    const id = est.lineItems[0]!.id;
    est = setMeters(est, id, 18);
    expect(est.lineItems[0]!.quantityMeters).toBe(18);
    // 18m × 1350 = 24300
    expect(priceEstimate(est, []).subtotalMinor).toBe(24300);
  });

  it('rejects negative metres', () => {
    let est = emptyProjectEstimate();
    est = addProjectLine(est, containmentLine(tray, 5, 'server'));
    expect(() => setMeters(est, est.lineItems[0]!.id, -3)).toThrow();
  });
});

describe('assignToLocation', () => {
  it('moves a line to another location', () => {
    let est = emptyProjectEstimate();
    est = addProjectLine(est, containmentLine(pvcTrunking, 10, 'recep'));
    const id = est.lineItems[0]!.id;
    est = assignToLocation(est, id, 'office');
    expect(est.lineItems[0]!.locationId).toBe('office');
  });

  it('unassigns a line when location is undefined', () => {
    let est = emptyProjectEstimate();
    est = addProjectLine(est, containmentLine(pvcTrunking, 10, 'recep'));
    const id = est.lineItems[0]!.id;
    est = assignToLocation(est, id, undefined);
    expect(est.lineItems[0]!.locationId).toBeUndefined();
  });
});

describe('linesAtLocation', () => {
  it('returns only lines at the given location', () => {
    let est = emptyProjectEstimate();
    est = addProjectLine(est, containmentLine(pvcTrunking, 10, 'recep'));
    est = addProjectLine(est, containmentLine(tray, 5, 'office'));
    expect(linesAtLocation(est, 'recep')).toHaveLength(1);
    expect(linesAtLocation(est, 'office')).toHaveLength(1);
    expect(linesAtLocation(est, 'server')).toHaveLength(0);
  });
});

describe('end-to-end: containment priced and rolled up by location', () => {
  it('sums containment runs into their floor', () => {
    const locations: Location[] = [
      { id: 'gf', projectId: 'p1', name: 'Ground Floor', sortOrder: 1 },
      { id: 'recep', projectId: 'p1', parentId: 'gf', name: 'Reception', sortOrder: 1 },
      { id: 'office', projectId: 'p1', parentId: 'gf', name: 'Office', sortOrder: 2 },
    ];
    let est = emptyProjectEstimate();
    est = addProjectLine(est, containmentLine(pvcTrunking, 12, 'recep')); // 5760
    est = addProjectLine(est, containmentLine(tray, 8, 'office')); // 10800

    const priced = priceEstimate(est, []);
    const locById = new Map(est.lineItems.map((l) => [l.id, l.locationId]));
    const tree = buildLocationTree(locations);
    const roll = rollUpTotals(tree, priced.lines, (id) => locById.get(id));

    expect(roll.byLocation.get('recep')!.ownMinor).toBe(5760);
    expect(roll.byLocation.get('office')!.ownMinor).toBe(10800);
    expect(roll.byLocation.get('gf')!.rolledUpMinor).toBe(5760 + 10800);
    expect(roll.unassignedMinor).toBe(0);
  });
});
