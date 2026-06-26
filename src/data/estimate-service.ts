/**
 * EstimateService — the bridge between catalogue data and the Phase 0 engine.
 *
 * Pure functions: given catalogue + assemblies and a user action ("add this
 * Quick-Quote tile"), produce updated domain objects. The UI and DB layers call
 * these; the functions themselves touch no I/O, so the snapshot-at-add-time
 * behaviour (spec §5.4) is unit-tested here directly.
 */

import {
  resolveAssemblyMaterialCost,
  type MaterialLookup,
} from '../domain/assembly';
import type { Assembly, Estimate, LineItem } from '../domain/types';

let counter = 0;
/** Simple id generator; the DB assigns real ids on persist. */
function newLineId(): string {
  counter += 1;
  return `line_${Date.now().toString(36)}_${counter}`;
}

/**
 * Build a LineItem from an assembly, snapshotting its material cost NOW.
 * This snapshot is what freezes once an estimate is sent/signed (spec §5.4).
 */
export function lineFromAssembly(
  assembly: Assembly,
  lookup: MaterialLookup,
  quantity = 1,
): LineItem {
  return {
    id: newLineId(),
    description: assembly.name,
    sourceAssemblyId: assembly.id,
    resolvedMaterialCostMinor: resolveAssemblyMaterialCost(assembly, lookup),
    laborBaseHours: assembly.baseLaborHours,
    quantity,
    appliedLaborToggleIds: [],
  };
}

/** Append a line to an estimate, returning a new estimate (immutable update). */
export function addLine(estimate: Estimate, line: LineItem): Estimate {
  return { ...estimate, lineItems: [...estimate.lineItems, line] };
}

/**
 * Add an assembly-backed line in one step — the Quick-Quote tap action.
 * If the line's assembly already exists in the estimate, increments its
 * quantity instead of adding a duplicate row (tap-to-increment, spec §3.2).
 */
export function addAssemblyToEstimate(
  estimate: Estimate,
  assembly: Assembly,
  lookup: MaterialLookup,
): Estimate {
  const existing = estimate.lineItems.find(
    (l) => l.sourceAssemblyId === assembly.id && !l.overrides,
  );
  if (existing) {
    const lineItems = estimate.lineItems.map((l) =>
      l === existing ? { ...l, quantity: (l.quantity ?? 1) + 1 } : l,
    );
    return { ...estimate, lineItems };
  }
  return addLine(estimate, lineFromAssembly(assembly, lookup));
}

/** Remove a line by id. */
export function removeLine(estimate: Estimate, lineId: string): Estimate {
  return { ...estimate, lineItems: estimate.lineItems.filter((l) => l.id !== lineId) };
}
