/**
 * Mappers (spec §1.3 DATA layer).
 *
 * Pure functions that translate raw persisted row shapes into the plain domain
 * objects the Phase 0 engine consumes, and back. Keeping these pure and
 * separate from WatermelonDB models means the translation logic — including the
 * JSON-encoded overrides and toggle arrays, the riskiest part — is unit-tested
 * without a running database.
 *
 * The "Raw" types below mirror exactly what is stored in SQLite (snake_case,
 * JSON strings for nested data). The domain types are the camelCase objects
 * from src/domain/types.ts.
 */

import type {
  Assembly,
  AssemblyComponent,
  Currency,
  Estimate,
  EstimateMode,
  EstimateStatus,
  LaborToggle,
  LaborToggleType,
  LineItem,
  LineItemOverrides,
  Material,
} from '../domain/types';

// ── Raw persisted shapes ────────────────────────────────────────────────

export interface RawMaterial {
  id: string;
  sku: string;
  description: string;
  unit: string;
  unit_cost_minor: number;
  catalogue_id: string;
}

export interface RawAssembly {
  id: string;
  name: string;
  category: string;
  base_labor_hours: number;
  quick_quote_icon?: string | null;
  quick_quote_rank?: number | null;
}

export interface RawAssemblyComponent {
  id: string;
  assembly_id: string;
  material_id: string;
  quantity: number;
  waste_factor?: number | null;
}

export interface RawLaborToggle {
  id: string;
  label: string;
  toggle_type: string;
  value: number;
  applies_to: string;
}

export interface RawLineItem {
  id: string;
  source_assembly_id?: string | null;
  location_id?: string | null;
  description: string;
  quantity?: number | null;
  quantity_meters?: number | null;
  resolved_material_cost_minor: number;
  labor_base_hours: number;
  overrides_json?: string | null;
  applied_labor_toggle_ids: string;
}

export interface RawEstimate {
  id: string;
  mode: string;
  status: string;
  currency: string;
  hourly_rate_minor: number;
  vat_rate_pct: number;
  applied_labor_toggle_ids: string;
}

// ── Validation guards for string-typed enums ──────────────────────────────

const TOGGLE_TYPES: readonly LaborToggleType[] = ['percentage', 'flatMultiplier', 'timeBuffer'];
const MODES: readonly EstimateMode[] = ['quick', 'project'];
const STATUSES: readonly EstimateStatus[] = ['draft', 'sent', 'signed'];
const CURRENCIES: readonly Currency[] = ['GBP', 'EUR'];

function assertOneOf<T extends string>(value: string, allowed: readonly T[], field: string): T {
  if ((allowed as readonly string[]).includes(value)) return value as T;
  throw new Error(`Invalid ${field}: "${value}". Expected one of: ${allowed.join(', ')}`);
}

/** Parse a JSON-encoded string array, tolerating null/empty as []. */
export function parseIdArray(json: string | null | undefined): string[] {
  if (!json) return [];
  const parsed: unknown = JSON.parse(json);
  if (!Array.isArray(parsed) || !parsed.every((x) => typeof x === 'string')) {
    throw new Error(`Expected a JSON array of strings, got: ${json}`);
  }
  return parsed;
}

/** Parse JSON-encoded overrides, returning undefined when absent. */
export function parseOverrides(json: string | null | undefined): LineItemOverrides | undefined {
  if (!json) return undefined;
  const o = JSON.parse(json) as LineItemOverrides;
  return o;
}

// ── Row → Domain ──────────────────────────────────────────────────────────

export function toMaterial(r: RawMaterial): Material {
  return {
    id: r.id,
    sku: r.sku,
    description: r.description,
    unit: r.unit,
    unitCostMinor: r.unit_cost_minor,
    catalogueId: r.catalogue_id,
  };
}

export function toAssembly(r: RawAssembly, components: RawAssemblyComponent[]): Assembly {
  const mapped: AssemblyComponent[] = components.map((c) => {
    const comp: AssemblyComponent = { materialId: c.material_id, quantity: c.quantity };
    if (c.waste_factor != null) comp.wasteFactor = c.waste_factor;
    return comp;
  });
  const assembly: Assembly = {
    id: r.id,
    name: r.name,
    category: r.category,
    baseLaborHours: r.base_labor_hours,
    components: mapped,
  };
  if (r.quick_quote_rank != null) assembly.quickQuoteRank = r.quick_quote_rank;
  if (r.quick_quote_icon != null) assembly.quickQuoteIcon = r.quick_quote_icon;
  return assembly;
}

export function toLaborToggle(r: RawLaborToggle): LaborToggle {
  return {
    id: r.id,
    label: r.label,
    type: assertOneOf(r.toggle_type, TOGGLE_TYPES, 'toggle_type'),
    value: r.value,
    appliesTo: r.applies_to === 'estimate' ? 'estimate' : 'line',
  };
}

export function toLineItem(r: RawLineItem): LineItem {
  const line: LineItem = {
    id: r.id,
    description: r.description,
    resolvedMaterialCostMinor: r.resolved_material_cost_minor,
    laborBaseHours: r.labor_base_hours,
    appliedLaborToggleIds: parseIdArray(r.applied_labor_toggle_ids),
  };
  if (r.source_assembly_id != null) line.sourceAssemblyId = r.source_assembly_id;
  if (r.location_id != null) line.locationId = r.location_id;
  if (r.quantity != null) line.quantity = r.quantity;
  if (r.quantity_meters != null) line.quantityMeters = r.quantity_meters;
  const overrides = parseOverrides(r.overrides_json);
  if (overrides) line.overrides = overrides;
  return line;
}

export function toEstimate(r: RawEstimate, lines: RawLineItem[]): Estimate {
  return {
    id: r.id,
    mode: assertOneOf(r.mode, MODES, 'mode'),
    status: assertOneOf(r.status, STATUSES, 'status'),
    currency: assertOneOf(r.currency, CURRENCIES, 'currency'),
    hourlyRateMinor: r.hourly_rate_minor,
    vatRatePct: r.vat_rate_pct,
    appliedLaborToggleIds: parseIdArray(r.applied_labor_toggle_ids),
    lineItems: lines.map(toLineItem),
  };
}

// ── Domain → Row (for persistence) ─────────────────────────────────────────

export function lineItemToRaw(line: LineItem, estimateId: string): RawLineItem {
  return {
    id: line.id,
    source_assembly_id: line.sourceAssemblyId ?? null,
    location_id: line.locationId ?? null,
    description: line.description,
    quantity: line.quantity ?? null,
    quantity_meters: line.quantityMeters ?? null,
    resolved_material_cost_minor: line.resolvedMaterialCostMinor,
    labor_base_hours: line.laborBaseHours,
    overrides_json: line.overrides ? JSON.stringify(line.overrides) : null,
    applied_labor_toggle_ids: JSON.stringify(line.appliedLaborToggleIds),
    // estimateId is carried for the FK column on persist
    ...({ estimate_id: estimateId } as object),
  };
}
