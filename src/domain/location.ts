/**
 * Location tree & roll-ups (spec §3.3).
 *
 * Project Mode organises an estimate by physical location: a tree of
 * Project › Floor/Area › Room › … Line items hang off locations via
 * LineItem.locationId. The two jobs here, both pure and testable:
 *
 *   1. buildLocationTree — turn flat Location rows into a nested tree.
 *   2. rollUpTotals — given priced lines, sum each location's own total AND
 *      the total of everything beneath it, so a floor shows the sum of its
 *      rooms without the caller walking the tree by hand.
 *
 * No pricing happens here — this module consumes the engine's per-line
 * breakdowns (LinePriceBreakdown) and aggregates them. One source of money math.
 */

import type { Location, MinorUnits } from './types';
import type { LinePriceBreakdown } from './pricing';
import { sumMinor } from './money';

export interface LocationNode {
  location: Location;
  children: LocationNode[];
}

export class LocationCycleError extends Error {
  constructor(public readonly locationId: string) {
    super(`Location tree contains a cycle or missing parent at "${locationId}".`);
    this.name = 'LocationCycleError';
  }
}

/**
 * Build a nested tree from flat location rows for one project.
 * Siblings are ordered by sortOrder then name. Detects cycles/orphans:
 * any node whose parentId doesn't resolve to a real ancestor is surfaced as a
 * root (so nothing is silently lost) unless it forms a cycle, which throws.
 */
export function buildLocationTree(locations: Location[]): LocationNode[] {
  const byId = new Map(locations.map((l) => [l.id, l]));
  const childrenOf = new Map<string | undefined, Location[]>();

  for (const loc of locations) {
    // Treat a parentId that doesn't exist as a root, not a lost node.
    const parentKey = loc.parentId && byId.has(loc.parentId) ? loc.parentId : undefined;
    const bucket = childrenOf.get(parentKey) ?? [];
    bucket.push(loc);
    childrenOf.set(parentKey, bucket);
  }

  const sortSiblings = (a: Location, b: Location) =>
    a.sortOrder - b.sortOrder || a.name.localeCompare(b.name);

  const visiting = new Set<string>();
  const emitted = new Set<string>();

  const build = (parentKey: string | undefined): LocationNode[] => {
    const kids = (childrenOf.get(parentKey) ?? []).slice().sort(sortSiblings);
    return kids.map((loc) => {
      if (visiting.has(loc.id)) throw new LocationCycleError(loc.id);
      visiting.add(loc.id);
      const node: LocationNode = { location: loc, children: build(loc.id) };
      visiting.delete(loc.id);
      emitted.add(loc.id);
      return node;
    });
  };

  const forest = build(undefined);

  // Any node not emitted is unreachable from a root — it sits in a cycle
  // (e.g. a↔b reference each other). Surface it loudly rather than dropping it.
  for (const loc of locations) {
    if (!emitted.has(loc.id)) throw new LocationCycleError(loc.id);
  }

  return forest;
}

export interface LocationTotals {
  /** Sum of lines assigned directly to this location. */
  ownMinor: MinorUnits;
  /** Sum of this location's own lines plus all descendants. */
  rolledUpMinor: MinorUnits;
}

export interface RollUpResult {
  /** Per-location totals, keyed by location id. */
  byLocation: Map<string, LocationTotals>;
  /** Lines with no locationId (e.g. Quick-Quote items promoted into a project). */
  unassignedMinor: MinorUnits;
  /** Grand total across every line, located or not. */
  grandTotalMinor: MinorUnits;
}

/**
 * Roll up priced line totals across the location tree.
 *
 * @param tree  the location forest from buildLocationTree
 * @param lines priced line breakdowns from the engine
 * @param lineLocationId resolves a line's locationId (kept as a param so this
 *        stays decoupled from the LineItem shape — the caller supplies the map)
 */
export function rollUpTotals(
  tree: LocationNode[],
  lines: LinePriceBreakdown[],
  lineLocationId: (lineId: string) => string | undefined,
): RollUpResult {
  // 1. Bucket each line's total onto its own location.
  const own = new Map<string, MinorUnits[]>();
  let unassigned: MinorUnits[] = [];

  for (const line of lines) {
    const locId = lineLocationId(line.lineId);
    if (locId == null) {
      unassigned.push(line.lineTotalMinor);
      continue;
    }
    const bucket = own.get(locId) ?? [];
    bucket.push(line.lineTotalMinor);
    own.set(locId, bucket);
  }

  const byLocation = new Map<string, LocationTotals>();

  // 2. Depth-first: a node's rolled-up total = its own + children's rolled-up.
  const visit = (node: LocationNode): MinorUnits => {
    const ownMinor = sumMinor(own.get(node.location.id) ?? []);
    const childrenMinor = sumMinor(node.children.map(visit));
    const rolledUpMinor = ownMinor + childrenMinor;
    byLocation.set(node.location.id, { ownMinor, rolledUpMinor });
    return rolledUpMinor;
  };

  const treeTotal = sumMinor(tree.map(visit));
  const unassignedMinor = sumMinor(unassigned);

  return {
    byLocation,
    unassignedMinor,
    grandTotalMinor: treeTotal + unassignedMinor,
  };
}
