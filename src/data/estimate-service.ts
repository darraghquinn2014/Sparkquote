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
import type { Assembly, Estimate, LineItem, Material } from '../domain/types';

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
 * Build a material-only line from a catalogue material.
 * No labour (laborBaseHours: 0) — raw materials are consumables/extras.
 * For metre-based units (cables, trunking) the amount goes in quantityMeters;
 * otherwise in quantity.
 */
/**
 * Build a standalone labour line.
 * - Hours mode: priced as hours x rate by the engine (recalculates with rate).
 * - Flat mode: a fixed labour amount, independent of the rate.
 * Either way it counts as labour, never materials.
 */
export function lineFromLabour(opts: { hours?: number; flatMinor?: number; description?: string }): LineItem {
  const isFlat = opts.flatMinor != null;
  return {
    id: newLineId(),
    description: opts.description ?? (isFlat ? "Labour" : `Labour (${opts.hours ?? 0}h)`),
    resolvedMaterialCostMinor: 0,
    laborBaseHours: 0,
    quantity: 1,
    appliedLaborToggleIds: [],
    overrides: {
      isCustom: true,
      customCostMinor: 0,
      customLaborHours: isFlat ? 0 : (opts.hours ?? 0),
      ...(isFlat ? { customLaborFlatMinor: opts.flatMinor } : {}),
    },
  };
}

export function lineFromMaterial(material: Material, amount = 1): LineItem {
  const isMetres = material.unit === "m";
  return {
    id: newLineId(),
    description: material.description,
    resolvedMaterialCostMinor: material.unitCostMinor,
    laborBaseHours: 0,
    ...(isMetres ? { quantityMeters: amount } : { quantity: amount }),
    appliedLaborToggleIds: [],
  };
}

/**
 * Add an assembly-backed line in one step — the Quick-Quote tap action.
 * If the line's assembly already exists in the estimate (in the same room,
 * where applicable), increments its quantity instead of adding a duplicate
 * row (tap-to-increment, spec §3.2). A distinct locationId always gets its
 * own line, since a socket install in the kitchen and one in the office are
 * separate rows for per-room rollups.
 */
export function addAssemblyToEstimate(
  estimate: Estimate,
  assembly: Assembly,
  lookup: MaterialLookup,
  locationId?: string,
): Estimate {
  const existing = estimate.lineItems.find(
    (l) => l.sourceAssemblyId === assembly.id && !l.overrides && l.locationId === locationId,
  );
  if (existing) {
    const lineItems = estimate.lineItems.map((l) =>
      l === existing ? { ...l, quantity: (l.quantity ?? 1) + 1 } : l,
    );
    return { ...estimate, lineItems };
  }
  return addLine(estimate, { ...lineFromAssembly(assembly, lookup), locationId });
}

/** Remove a line by id. */
export function removeLine(estimate: Estimate, lineId: string): Estimate {
  return { ...estimate, lineItems: estimate.lineItems.filter((l) => l.id !== lineId) };
}
