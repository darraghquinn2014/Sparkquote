/**
 * Recalculation cascade (spec §5.4) — the single most important data rule.
 *
 * Two correct behaviours when material prices change (e.g. after an import):
 *
 *   - Catalogue & assemblies are ALWAYS live: assembly cost is computed from
 *     components (see assembly.ts), so new prices are reflected instantly.
 *
 *   - Issued estimates must NOT silently change. A sent/signed quote is a
 *     contract snapshot. Each LineItem stores resolvedMaterialCostMinor taken
 *     at add time, plus a link to its source assembly.
 *
 * This module computes, for a DRAFT estimate, whether any line's snapshot has
 * drifted from the current live assembly cost, and produces a refreshed copy
 * the user can opt into. For SENT/SIGNED estimates it refuses to change
 * anything and reports drift as informational only.
 */

import type { Assembly, Estimate, LineItem, MinorUnits } from './types';
import { resolveAssemblyMaterialCost, type MaterialLookup } from './assembly';

export interface LineDrift {
  lineId: string;
  sourceAssemblyId: string;
  snapshotMinor: MinorUnits;
  liveMinor: MinorUnits;
  /** liveMinor - snapshotMinor; positive = prices went up. */
  deltaMinor: MinorUnits;
}

export interface DriftReport {
  estimateId: string;
  status: Estimate['status'];
  /** True if the engine is permitted to apply a refresh (drafts only). */
  refreshAllowed: boolean;
  drifts: LineDrift[];
}

/**
 * Compute price drift for every line backed by an assembly.
 * Lines with custom/override unit costs are skipped — an explicit override is
 * the user's deliberate price and is never auto-changed.
 */
export function computeDrift(
  estimate: Estimate,
  assemblies: Map<string, Assembly>,
  lookup: MaterialLookup,
): DriftReport {
  const drifts: LineDrift[] = [];

  for (const line of estimate.lineItems) {
    if (!line.sourceAssemblyId) continue;
    // A deliberate override wins; never override the override.
    if (line.overrides?.isCustom || line.overrides?.unitCostMinor != null) continue;

    const assembly = assemblies.get(line.sourceAssemblyId);
    if (!assembly) continue;

    const live = resolveAssemblyMaterialCost(assembly, lookup);
    if (live !== line.resolvedMaterialCostMinor) {
      drifts.push({
        lineId: line.id,
        sourceAssemblyId: line.sourceAssemblyId,
        snapshotMinor: line.resolvedMaterialCostMinor,
        liveMinor: live,
        deltaMinor: live - line.resolvedMaterialCostMinor,
      });
    }
  }

  return {
    estimateId: estimate.id,
    status: estimate.status,
    refreshAllowed: estimate.status === 'draft',
    drifts,
  };
}

/**
 * Produce a NEW estimate with line snapshots refreshed to live prices.
 *
 * Refuses to change anything unless the estimate is a draft — a sent or signed
 * quote is frozen by contract. Returns the estimate unchanged (same reference)
 * if not allowed or if there is no drift, so callers can cheaply detect no-ops.
 */
export function applyRefresh(
  estimate: Estimate,
  assemblies: Map<string, Assembly>,
  lookup: MaterialLookup,
): Estimate {
  if (estimate.status !== 'draft') return estimate;

  const report = computeDrift(estimate, assemblies, lookup);
  if (report.drifts.length === 0) return estimate;

  const driftByLine = new Map(report.drifts.map((d) => [d.lineId, d]));

  const lineItems: LineItem[] = estimate.lineItems.map((line) => {
    const drift = driftByLine.get(line.id);
    if (!drift) return line;
    return { ...line, resolvedMaterialCostMinor: drift.liveMinor };
  });

  return { ...estimate, lineItems };
}
