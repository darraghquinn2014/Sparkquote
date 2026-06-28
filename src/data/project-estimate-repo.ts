/**
 * Per-project estimate repository.
 *
 * Each project gets one estimate stored under a stable id derived from the
 * projectId. Same schema as the active estimate but with project_id set and
 * mode = 'project'. Line items carry locationId (roomId) so they roll up by room.
 */
import { Q, Model } from '@nozbe/watermelondb';
import { database } from './database';
import { EstimateModel, LineItemModel } from './models';
import { toEstimate, lineItemToRaw } from './mappers';
import type { RawEstimate, RawLineItem } from './mappers';
import type { Estimate, LineItem } from '../domain/types';

function estId(projectId: string): string {
  return `project-est-${projectId}`;
}

function applyLineFields(r: LineItemModel, line: LineItem, estimateId: string) {
  const raw = lineItemToRaw(line, estimateId) as RawLineItem;
  r.estimateId = estimateId;
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

export async function saveProjectEstimate(projectId: string, estimate: Estimate): Promise<void> {
  const id = estId(projectId);
  await database.write(async () => {
    const estimates = database.get<EstimateModel>('estimates');
    const lines = database.get<LineItemModel>('line_items');

    let estRow: EstimateModel | null = null;
    try { estRow = await estimates.find(id); } catch { estRow = null; }

    const writeFields = (r: EstimateModel) => {
      r.projectId = projectId;
      r.mode = 'project';
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
      await estimates.create((r) => { r._raw.id = id; writeFields(r); });
    }

    const existing = await lines.query(Q.where('estimate_id', id)).fetch();
    const existingById = new Map(existing.map((l) => [l.id, l]));
    const wantedIds = new Set(estimate.lineItems.map((l) => l.id));
    const batch: Model[] = [];

    for (const line of estimate.lineItems) {
      const row = existingById.get(line.id);
      if (row) {
        batch.push(row.prepareUpdate((r) => applyLineFields(r, line, id)));
      } else {
        batch.push(lines.prepareCreate((r) => { r._raw.id = line.id; applyLineFields(r, line, id); }));
      }
    }
    for (const row of existing) {
      if (!wantedIds.has(row.id)) batch.push(row.prepareDestroyPermanently());
    }
    await database.batch(...batch);
  });
}

export async function loadProjectEstimate(projectId: string): Promise<Estimate | null> {
  const id = estId(projectId);
  let estRow: EstimateModel;
  try { estRow = await database.get<EstimateModel>('estimates').find(id); } catch { return null; }

  const lineRows = await database
    .get<LineItemModel>('line_items')
    .query(Q.where('estimate_id', id))
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
