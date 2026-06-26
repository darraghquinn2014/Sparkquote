import { describe, it, expect } from 'vitest';
import {
  buildLocationTree,
  rollUpTotals,
  LocationCycleError,
  type LocationNode,
} from '../location';
import type { Location } from '../types';
import type { LinePriceBreakdown } from '../pricing';

// A small building: Ground floor (Reception, Office), First floor (Server Room)
const locations: Location[] = [
  { id: 'gf', projectId: 'p1', name: 'Ground Floor', sortOrder: 1 },
  { id: 'ff', projectId: 'p1', name: 'First Floor', sortOrder: 2 },
  { id: 'recep', projectId: 'p1', parentId: 'gf', name: 'Reception', sortOrder: 1 },
  { id: 'office', projectId: 'p1', parentId: 'gf', name: 'Office', sortOrder: 2 },
  { id: 'server', projectId: 'p1', parentId: 'ff', name: 'Server Room', sortOrder: 1 },
];

function names(nodes: LocationNode[]): string[] {
  return nodes.map((n) => n.location.name);
}

describe('buildLocationTree', () => {
  it('nests rooms under floors', () => {
    const tree = buildLocationTree(locations);
    expect(names(tree)).toEqual(['Ground Floor', 'First Floor']);
    const gf = tree[0]!;
    expect(names(gf.children)).toEqual(['Reception', 'Office']);
    const ff = tree[1]!;
    expect(names(ff.children)).toEqual(['Server Room']);
  });

  it('orders siblings by sortOrder then name', () => {
    const shuffled: Location[] = [
      { id: 'b', projectId: 'p1', name: 'Bravo', sortOrder: 2 },
      { id: 'a', projectId: 'p1', name: 'Alpha', sortOrder: 1 },
      { id: 'a2', projectId: 'p1', name: 'Alpha2', sortOrder: 1 },
    ];
    expect(names(buildLocationTree(shuffled))).toEqual(['Alpha', 'Alpha2', 'Bravo']);
  });

  it('treats a missing parent as a root rather than losing the node', () => {
    const orphan: Location[] = [
      { id: 'x', projectId: 'p1', parentId: 'ghost', name: 'Orphan', sortOrder: 1 },
    ];
    expect(names(buildLocationTree(orphan))).toEqual(['Orphan']);
  });

  it('throws on a cycle', () => {
    const cyclic: Location[] = [
      { id: 'a', projectId: 'p1', parentId: 'b', name: 'A', sortOrder: 1 },
      { id: 'b', projectId: 'p1', parentId: 'a', name: 'B', sortOrder: 1 },
    ];
    expect(() => buildLocationTree(cyclic)).toThrow(LocationCycleError);
  });

  it('handles an empty list', () => {
    expect(buildLocationTree([])).toEqual([]);
  });
});

describe('rollUpTotals', () => {
  const tree = buildLocationTree(locations);

  // priced lines: reception 1000, office 2000, server 5000, plus one unassigned 300
  const lines: LinePriceBreakdown[] = [
    mkLine('l1', 1000),
    mkLine('l2', 2000),
    mkLine('l3', 5000),
    mkLine('l4', 300),
  ];
  const lineLoc: Record<string, string | undefined> = {
    l1: 'recep', l2: 'office', l3: 'server', l4: undefined,
  };

  it('rolls room totals up into their floors', () => {
    const r = rollUpTotals(tree, lines, (id) => lineLoc[id]);
    expect(r.byLocation.get('recep')!.ownMinor).toBe(1000);
    expect(r.byLocation.get('office')!.ownMinor).toBe(2000);
    // Ground Floor has no own lines but rolls up reception + office
    expect(r.byLocation.get('gf')!.ownMinor).toBe(0);
    expect(r.byLocation.get('gf')!.rolledUpMinor).toBe(3000);
    // First Floor rolls up the server room
    expect(r.byLocation.get('ff')!.rolledUpMinor).toBe(5000);
  });

  it('tracks unassigned lines and the grand total', () => {
    const r = rollUpTotals(tree, lines, (id) => lineLoc[id]);
    expect(r.unassignedMinor).toBe(300);
    expect(r.grandTotalMinor).toBe(1000 + 2000 + 5000 + 300);
  });

  it('a location with both own lines and children sums both', () => {
    // add a line directly on Ground Floor itself
    const withDirect = [...lines, mkLine('l5', 750)];
    const loc2: Record<string, string | undefined> = { ...lineLoc, l5: 'gf' };
    const r = rollUpTotals(tree, withDirect, (id) => loc2[id]);
    expect(r.byLocation.get('gf')!.ownMinor).toBe(750);
    expect(r.byLocation.get('gf')!.rolledUpMinor).toBe(750 + 3000);
  });
});

// minimal LinePriceBreakdown for roll-up tests (only lineId + total are read)
function mkLine(lineId: string, total: number): LinePriceBreakdown {
  return {
    lineId,
    unitMaterialCostMinor: total,
    effectiveQuantity: 1,
    materialSubtotalMinor: total,
    markupAmountMinor: 0,
    materialTotalMinor: total,
    labor: { hours: 0, costMinor: 0, effectiveMultiplier: 1 },
    lineTotalMinor: total,
  };
}
