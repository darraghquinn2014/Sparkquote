/**
 * Project-mode service helpers (spec §3.3).
 *
 * Pure functions for the Fit-out / Project workflow:
 *  - containmentLine: a linear line item priced per metre (trunking, tray,
 *    basket, SWA). Uses quantityMeters, not a discrete count.
 *  - assembly/material lines tagged with a locationId so they roll up under
 *    the right room/floor.
 *  - assignToLocation / setMeters: immutable edits used by the UI.
 *
 * All money still flows through the engine; these only shape LineItems.
 */

import type { Estimate, LineItem, Material } from '../domain/types';

let counter = 0;
function newLineId(): string {
  counter += 1;
  return `line_proj_${Date.now().toString(36)}_${counter}`;
}

/**
 * Create a containment line measured in metres, snapshotting the material's
 * per-metre cost now. Labour for containment is typically priced separately
 * (per the run) so base hours default to 0 and can be set by the caller.
 */
export function containmentLine(
  material: Material,
  meters: number,
  locationId: string,
  laborBaseHours = 0,
): LineItem {
  if (meters < 0) throw new Error(`Containment metres cannot be negative: ${meters}`);
  return {
    id: newLineId(),
    description: material.description,
    locationId,
    quantityMeters: meters,
    resolvedMaterialCostMinor: material.unitCostMinor, // per-metre snapshot
    laborBaseHours,
    appliedLaborToggleIds: [],
  };
}

/** Append a line to an estimate (immutable). */
export function addProjectLine(estimate: Estimate, line: LineItem): Estimate {
  return { ...estimate, lineItems: [...estimate.lineItems, line] };
}

/** Move a line to a different location (e.g. dragged between rooms). */
export function assignToLocation(
  estimate: Estimate,
  lineId: string,
  locationId: string | undefined,
): Estimate {
  const lineItems = estimate.lineItems.map((l) => {
    if (l.id !== lineId) return l;
    if (locationId == null) {
      const { locationId: _drop, ...rest } = l;
      return rest;
    }
    return { ...l, locationId };
  });
  return { ...estimate, lineItems };
}

/** Update the metre count on a containment line (immutable). */
export function setMeters(estimate: Estimate, lineId: string, meters: number): Estimate {
  if (meters < 0) throw new Error(`Containment metres cannot be negative: ${meters}`);
  const lineItems = estimate.lineItems.map((l) =>
    l.id === lineId ? { ...l, quantityMeters: meters } : l,
  );
  return { ...estimate, lineItems };
}

/** All line ids assigned to a given location (not including descendants). */
export function linesAtLocation(estimate: Estimate, locationId: string): LineItem[] {
  return estimate.lineItems.filter((l) => l.locationId === locationId);
}
