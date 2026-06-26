/**
 * Override service (spec §5, §6) — the pure mutations behind the slide-up
 * drawer. Every function takes an estimate and returns a NEW estimate; the
 * engine then re-prices. Overrides are layered, never destructive: clearing an
 * override restores the line's underlying assembly/catalogue price.
 *
 * Engine support for these already exists and is tested (pricing.test.ts);
 * this layer is the immutable edit plumbing the UI calls.
 */

import type { Estimate, LineItem, LineItemOverrides, Material } from '../domain/types';

let counter = 0;
function newLineId(): string {
  counter += 1;
  return `line_custom_${Date.now().toString(36)}_${counter}`;
}

/** Map over the matching line, returning a new estimate. */
function patchLine(
  estimate: Estimate,
  lineId: string,
  patch: (line: LineItem) => LineItem,
): Estimate {
  const lineItems = estimate.lineItems.map((l) => (l.id === lineId ? patch(l) : l));
  return { ...estimate, lineItems };
}

/** Merge a partial overrides object onto a line (immutable). */
function mergeOverrides(line: LineItem, next: Partial<LineItemOverrides>): LineItem {
  const merged: LineItemOverrides = { ...line.overrides, ...next };
  // If every field is now empty/undefined, drop the overrides object entirely
  // so the line reverts cleanly to its underlying price.
  const hasAny =
    merged.unitCostMinor != null ||
    merged.markupPct != null ||
    merged.isCustom === true;
  if (!hasAny) {
    const { overrides: _drop, ...rest } = line;
    return rest;
  }
  return { ...line, overrides: merged };
}

// ── Unit cost override (spec §6) ──────────────────────────────────────────

/** Replace the per-unit material cost for one line. */
export function setUnitCostOverride(
  estimate: Estimate,
  lineId: string,
  unitCostMinor: number,
): Estimate {
  if (unitCostMinor < 0) throw new Error(`Unit cost cannot be negative: ${unitCostMinor}`);
  return patchLine(estimate, lineId, (l) => mergeOverrides(l, { unitCostMinor }));
}

/** Remove a unit-cost override, restoring the underlying price. */
export function clearUnitCostOverride(estimate: Estimate, lineId: string): Estimate {
  return patchLine(estimate, lineId, (l) => {
    if (!l.overrides) return l;
    const { unitCostMinor: _drop, ...rest } = l.overrides;
    return mergeOverrides({ ...l, overrides: {} }, rest);
  });
}

// ── Markup (spec §6) ──────────────────────────────────────────────────────

/** Apply a markup percentage to one line (e.g. 20 = +20%). */
export function setMarkup(estimate: Estimate, lineId: string, markupPct: number): Estimate {
  if (markupPct < 0) throw new Error(`Markup cannot be negative: ${markupPct}`);
  return patchLine(estimate, lineId, (l) => mergeOverrides(l, { markupPct }));
}

/** Remove markup from one line. */
export function clearMarkup(estimate: Estimate, lineId: string): Estimate {
  return patchLine(estimate, lineId, (l) => {
    if (!l.overrides) return l;
    const { markupPct: _drop, ...rest } = l.overrides;
    return mergeOverrides({ ...l, overrides: {} }, rest);
  });
}

// ── Custom one-off item (spec §6) ─────────────────────────────────────────

export interface CustomItemInput {
  name: string;
  costMinor: number;
  laborHours?: number;
  quantity?: number;
}

/** Build a one-off custom line not backed by the catalogue. */
export function customLine(input: CustomItemInput): LineItem {
  if (input.costMinor < 0) throw new Error('Custom cost cannot be negative');
  const overrides: LineItemOverrides = {
    isCustom: true,
    customName: input.name,
    customCostMinor: input.costMinor,
  };
  if (input.laborHours != null) overrides.customLaborHours = input.laborHours;
  return {
    id: newLineId(),
    description: input.name,
    resolvedMaterialCostMinor: 0, // custom lines price from overrides, not this
    laborBaseHours: 0,
    quantity: input.quantity ?? 1,
    overrides,
    appliedLaborToggleIds: [],
  };
}

/** Append a custom line to an estimate. */
export function addCustomLine(estimate: Estimate, input: CustomItemInput): Estimate {
  return { ...estimate, lineItems: [...estimate.lineItems, customLine(input)] };
}

// ── Quantity (drawer stepper) ─────────────────────────────────────────────

export function setQuantity(estimate: Estimate, lineId: string, quantity: number): Estimate {
  if (quantity < 0) throw new Error(`Quantity cannot be negative: ${quantity}`);
  return patchLine(estimate, lineId, (l) => ({ ...l, quantity }));
}

// ── Line-level labor toggles (spec §7) ────────────────────────────────────

/** Turn a line-level labor toggle on or off for one line. */
export function setLineToggle(
  estimate: Estimate,
  lineId: string,
  toggleId: string,
  on: boolean,
): Estimate {
  return patchLine(estimate, lineId, (l) => {
    const has = l.appliedLaborToggleIds.includes(toggleId);
    if (on && !has) {
      return { ...l, appliedLaborToggleIds: [...l.appliedLaborToggleIds, toggleId] };
    }
    if (!on && has) {
      return { ...l, appliedLaborToggleIds: l.appliedLaborToggleIds.filter((id) => id !== toggleId) };
    }
    return l;
  });
}

/** Turn an estimate-wide labor toggle on or off (e.g. out-of-hours). */
export function setEstimateToggle(
  estimate: Estimate,
  toggleId: string,
  on: boolean,
): Estimate {
  const has = estimate.appliedLaborToggleIds.includes(toggleId);
  if (on && !has) {
    return { ...estimate, appliedLaborToggleIds: [...estimate.appliedLaborToggleIds, toggleId] };
  }
  if (!on && has) {
    return {
      ...estimate,
      appliedLaborToggleIds: estimate.appliedLaborToggleIds.filter((id) => id !== toggleId),
    };
  }
  return estimate;
}
