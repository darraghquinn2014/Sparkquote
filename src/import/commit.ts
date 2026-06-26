/**
 * Import commit orchestration (spec §4.4 steps 5-6, §5.4).
 *
 * Ties the pipeline together: given validated materials and the existing world,
 * compute what changes, and report the cascade impact on draft estimates BEFORE
 * the user commits — so they see "this import changes 3 draft quotes" up front.
 *
 * The actual DB write is transactional and lives behind the CatalogueRepository
 * interface (implemented over WatermelonDB in the app, mocked in tests). This
 * keeps the orchestration logic pure and testable: the rule that an import is
 * all-or-nothing, and that it re-prices drafts but never sent/signed quotes,
 * is verified without a database.
 */

import type { RawMaterial } from '../data/mappers';
import type { Assembly, Estimate, Material } from '../domain/types';
import { toMaterial } from '../data/mappers';
import { materialLookupFrom } from '../domain/assembly';
import { computeDrift, applyRefresh, type DriftReport } from '../domain/recalculation';

export interface ImportPlan {
  catalogueId: string;
  added: number;
  updated: number;
  unchanged: number;
  /** Materials present before but absent from the new file (kept, not deleted). */
  retained: number;
  /** Per-draft-estimate drift caused by the new prices. */
  draftImpacts: DriftReport[];
  /** Sent/signed estimates that WOULD drift but stay frozen (informational). */
  frozenImpacts: DriftReport[];
}

/**
 * Build an import plan: diff new materials against existing, and compute the
 * cascade impact across all estimates. Pure — no writes.
 */
export function planImport(
  newRaw: RawMaterial[],
  existing: Material[],
  assemblies: Assembly[],
  estimates: Estimate[],
): ImportPlan {
  const newMaterials = newRaw.map(toMaterial);
  const existingBySku = new Map(existing.map((m) => [m.sku, m]));
  const newBySku = new Map(newMaterials.map((m) => [m.sku, m]));

  let added = 0;
  let updated = 0;
  let unchanged = 0;

  for (const m of newMaterials) {
    const prev = existingBySku.get(m.sku);
    if (!prev) added += 1;
    else if (prev.unitCostMinor !== m.unitCostMinor) updated += 1;
    else unchanged += 1;
  }

  // Materials kept because they weren't in the new file (we don't delete —
  // a wholesaler omitting a line shouldn't wipe it from the user's catalogue).
  const retained = existing.filter((m) => !newBySku.has(m.sku)).length;

  // Merged catalogue = existing overlaid with the new prices.
  const merged = new Map(existing.map((m) => [m.id, m]));
  for (const m of newMaterials) merged.set(m.id, m);
  // also overlay by sku for updated existing rows that share sku but differ in id
  const mergedBySku = new Map<string, Material>();
  for (const m of merged.values()) mergedBySku.set(m.sku, m);
  for (const m of newMaterials) mergedBySku.set(m.sku, m);
  const mergedMaterials = Array.from(mergedBySku.values());

  const lookup = materialLookupFrom(mergedMaterials);
  const assemblyMap = new Map(assemblies.map((a) => [a.id, a]));

  const draftImpacts: DriftReport[] = [];
  const frozenImpacts: DriftReport[] = [];

  for (const est of estimates) {
    const report = computeDrift(est, assemblyMap, lookup);
    if (report.drifts.length === 0) continue;
    if (report.status === 'draft') draftImpacts.push(report);
    else frozenImpacts.push(report);
  }

  return {
    catalogueId: newRaw[0]?.catalogue_id ?? 'unknown',
    added, updated, unchanged, retained,
    draftImpacts, frozenImpacts,
  };
}

/** Transactional repository the commit step writes through (WatermelonDB in app). */
export interface CatalogueRepository {
  /** Replace/insert materials and persist refreshed draft estimates atomically. */
  commitImport(input: {
    materials: RawMaterial[];
    refreshedDrafts: Estimate[];
  }): Promise<void>;
}

export interface CommitResult {
  plan: ImportPlan;
  refreshedDraftIds: string[];
}

/**
 * Commit an import: write the new materials and the refreshed draft estimates
 * in a single transaction. Sent/signed estimates are passed through untouched.
 *
 * @param autoRefreshDrafts if true, draft snapshots are updated to new prices;
 *        if false, drafts keep their snapshots and the UI prompts per the spec.
 */
export async function commitImport(
  repo: CatalogueRepository,
  newRaw: RawMaterial[],
  existing: Material[],
  assemblies: Assembly[],
  estimates: Estimate[],
  autoRefreshDrafts: boolean,
): Promise<CommitResult> {
  const plan = planImport(newRaw, existing, assemblies, estimates);

  const mergedBySku = new Map<string, Material>();
  for (const m of existing) mergedBySku.set(m.sku, m);
  for (const m of newRaw.map(toMaterial)) mergedBySku.set(m.sku, m);
  const lookup = materialLookupFrom(Array.from(mergedBySku.values()));
  const assemblyMap = new Map(assemblies.map((a) => [a.id, a]));

  const refreshedDrafts: Estimate[] = [];
  if (autoRefreshDrafts) {
    for (const est of estimates) {
      if (est.status !== 'draft') continue;
      const refreshed = applyRefresh(est, assemblyMap, lookup);
      if (refreshed !== est) refreshedDrafts.push(refreshed);
    }
  }

  await repo.commitImport({ materials: newRaw, refreshedDrafts });

  return { plan, refreshedDraftIds: refreshedDrafts.map((e) => e.id) };
}
