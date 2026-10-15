/**
 * Row → raw translation shared by every estimate repository (active quick
 * quote, project quotes, saved quotes), so a new estimate column only has to
 * be read in one place. Domain conversion stays in the tested mappers.
 */
import type { EstimateModel, LineItemModel } from './models';
import type { RawEstimate, RawLineItem } from './mappers';

export function estimateRowToRaw(r: EstimateModel): RawEstimate {
  return {
    id: r.id,
    mode: r.mode,
    status: r.status,
    currency: r.currency,
    hourly_rate_minor: r.hourlyRateMinor,
    vat_rate_pct: r.vatRatePct,
    show_labor_breakdown: r.showLaborBreakdown,
    applied_labor_toggle_ids: r.appliedLaborToggleIds,
    client_id: r.clientId,
    client_name: r.clientName,
    sent_at: r.sentAt,
    status_changed_at: r.statusChangedAt,
    created_at: r.createdAt?.getTime() ?? null,
  };
}

export function lineRowToRaw(l: LineItemModel): RawLineItem {
  return {
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
  };
}
