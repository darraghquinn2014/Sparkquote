/**
 * Active-estimate repository.
 *
 * Persists the single in-progress estimate (and its line items) so it survives
 * the app being closed. Stored under a stable id so there's always exactly one
 * "active" estimate to reload. Translation uses the existing tested mappers;
 * this file only moves rows.
 *
 * Save strategy: upsert the estimate row, then diff line items — update existing
 * rows, create new ones, destroy removed ones. This avoids destroy+recreate
 * churn (and the "cached record sent over the bridge" warning) on every edit.
 */
import { Q, Model } from '@nozbe/watermelondb';
import { database } from './database';
import { EstimateModel, LineItemModel } from './models';
import { toEstimate, lineItemToRaw } from './mappers';
import type { RawEstimate, RawLineItem } from './mappers';
import type { Estimate, LineItem } from '../domain/types';

const ACTIVE_ID = 'active-estimate';

function applyLineFields(r: LineItemModel, line: LineItem) {
  const raw = lineItemToRaw(line, ACTIVE_ID) as RawLineItem;
  r.estimateId = ACTIVE_ID;
  r.sourceAssemblyId = raw.source_assembly_id ?? null;
  r.locationId = raw.location_id ?? null;
  r.description = raw.description;
  r.quantity = raw.quantity ?? null;
  r.quantityMeters = raw.quantity_meters ?? null;
  r.resolvedMaterialCostMinor = raw.resolved_material_cost_minor;
  r.laborBaseHours = raw.labor_base_hours;
  r.overridesJson = raw.overrides_json ?? null;
  r.appliedLaborToggleIds = raw.applied_labor_toggle_ids;
}

/** Save the active estimate + its line items in one transaction (diffed). */
export async function saveActiveEstimate(estimate: Estimate): Promise<void> {
  await database.write(async () => {
    const estimates = database.get<EstimateModel>('estimates');
    const lines = database.get<LineItemModel>('line_items');

    // Upsert the estimate row under the stable ACTIVE_ID.
    let estRow: EstimateModel | null = null;
    try {
      estRow = await estimates.find(ACTIVE_ID);
    } catch {
      estRow = null;
    }

    const writeFields = (r: EstimateModel) => {
      r.projectId = null;
      r.mode = estimate.mode;
      r.status = estimate.status;
      r.currency = estimate.currency;
      r.hourlyRateMinor = estimate.hourlyRateMinor;
      r.vatRatePct = estimate.vatRatePct;
      r.showLaborBreakdown = estimate.showLaborBreakdown ?? true;
      r.appliedLaborToggleIds = JSON.stringify(estimate.appliedLaborToggleIds);
    };

    if (estRow) {
      await estRow.update(writeFields);
    } else {
      await estimates.create((r) => {
        r._raw.id = ACTIVE_ID;
        writeFields(r);
      });
    }

    // Diff line items: update existing, create new, destroy removed.
    const existing = await lines.query(Q.where('estimate_id', ACTIVE_ID)).fetch();
    const existingById = new Map(existing.map((l) => [l.id, l]));
    const wantedIds = new Set(estimate.lineItems.map((l) => l.id));

    const batch: Model[] = [];

    for (const line of estimate.lineItems) {
      const row = existingById.get(line.id);
      if (row) {
        batch.push(row.prepareUpdate((r) => applyLineFields(r, line)));
      } else {
        batch.push(
          lines.prepareCreate((r) => {
            r._raw.id = line.id;
            applyLineFields(r, line);
          }),
        );
      }
    }

    for (const row of existing) {
      if (!wantedIds.has(row.id)) {
        batch.push(row.prepareDestroyPermanently());
      }
    }

    await database.batch(...batch);
  });
}

/** Load the active estimate, or null if none saved. */
export async function loadActiveEstimate(): Promise<Estimate | null> {
  const estimates = database.get<EstimateModel>('estimates');
  let estRow: EstimateModel;
  try {
    estRow = await estimates.find(ACTIVE_ID);
  } catch {
    return null;
  }

  const lineRows = await database
    .get<LineItemModel>('line_items')
    .query(Q.where('estimate_id', ACTIVE_ID))
    .fetch();

  const rawEstimate: RawEstimate = {
    id: estRow.id,
    mode: estRow.mode,
    status: estRow.status,
    currency: estRow.currency,
    hourly_rate_minor: estRow.hourlyRateMinor,
    vat_rate_pct: estRow.vatRatePct,
    show_labor_breakdown: estRow.showLaborBreakdown,
    applied_labor_toggle_ids: estRow.appliedLaborToggleIds,
  };

  const rawLines: RawLineItem[] = lineRows.map((l) => ({
    id: l.id,
    source_assembly_id: l.sourceAssemblyId,
    location_id: l.locationId,
    description: l.description,
    quantity: l.quantity,
    quantity_meters: l.quantityMeters,
    resolved_material_cost_minor: l.resolvedMaterialCostMinor,
    labor_base_hours: l.laborBaseHours,
    overrides_json: l.overridesJson,
    applied_labor_toggle_ids: l.appliedLaborToggleIds,
  }));

  return toEstimate(rawEstimate, rawLines);
}

/** Delete the active estimate and its line items. */
export async function clearActiveEstimate(): Promise<void> {
  await database.write(async () => {
    const lines = await database
      .get<LineItemModel>('line_items')
      .query(Q.where('estimate_id', ACTIVE_ID))
      .fetch();
    const batch: Model[] = lines.map((l) => l.prepareDestroyPermanently());
    try {
      const estRow = await database.get<EstimateModel>('estimates').find(ACTIVE_ID);
      batch.push(estRow.prepareDestroyPermanently());
    } catch {
      // no estimate row; nothing to delete
    }
    await database.batch(...batch);
  });
}
