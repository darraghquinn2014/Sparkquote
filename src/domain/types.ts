/**
 * SparkQuote — Domain Types
 *
 * Plain data shapes for the pricing engine. No I/O, no framework imports.
 * Per spec §1.4: all money is integer MINOR units (pence / cent). Never floats.
 */

import type { SymbolType } from '../media/annotation-service';

/** Integer minor units of currency (pence or cent). e.g. 1250 = £12.50 */
export type MinorUnits = number;

export type Currency = 'GBP' | 'EUR';
export type Market = 'UK' | 'IE';

// ─────────────────────────────────────────────────────────────────────────
// Catalogue: Materials
// ─────────────────────────────────────────────────────────────────────────

export interface Material {
  id: string;
  sku: string;
  description: string;
  /** Display unit, e.g. 'each', 'm', 'box'. Informational for the engine. */
  unit: string;
  /** Current wholesale/trade unit cost in minor units. The live price. */
  unitCostMinor: MinorUnits;
  catalogueId: string;
}

// ─────────────────────────────────────────────────────────────────────────
// Assemblies (spec §5): functional bundles of materials + base labor.
// Cost is COMPUTED from components, never stored on the assembly.
// ─────────────────────────────────────────────────────────────────────────

export interface AssemblyComponent {
  materialId: string;
  /** How many of this material the assembly uses (e.g. 5 for 5m of cable). */
  quantity: number;
  /** Optional waste multiplier, e.g. 1.1 = +10% offcuts. Defaults to 1. */
  wasteFactor?: number;
}

export interface Assembly {
  id: string;
  name: string;
  category: string;
  /** Base labor hours for one unit of this assembly, before toggles. */
  baseLaborHours: number;
  components: AssemblyComponent[];
  /** If set, this assembly is a Quick-Quote favourite; value orders the tiles. */
  quickQuoteRank?: number;
  /** Optional icon name for the Quick-Quote tile. */
  quickQuoteIcon?: string;
}

// ─────────────────────────────────────────────────────────────────────────
// Labor toggles (spec §7): composable on-site multipliers.
// ─────────────────────────────────────────────────────────────────────────

export type LaborToggleType = 'percentage' | 'flatMultiplier' | 'timeBuffer';

export interface LaborToggle {
  id: string;
  label: string;
  type: LaborToggleType;
  /**
   * Meaning depends on `type`:
   *  - 'percentage'     → fractional add within the percentage group (0.15 = +15%)
   *  - 'flatMultiplier' → multiplicative factor (1.5 = ×1.5)
   *  - 'timeBuffer'     → fractional add within the buffer group (0.10 = +10%)
   */
  value: number;
  appliesTo: 'line' | 'estimate';
}

// ─────────────────────────────────────────────────────────────────────────
// Overrides (spec §6): per-line, layered on top of resolved cost.
// Non-destructive — original catalogue/assembly data is untouched.
// ─────────────────────────────────────────────────────────────────────────

export interface LineItemOverrides {
  /** Replaces the resolved per-unit MATERIAL cost for this line only. */
  unitCostMinor?: MinorUnits;
  /** Markup applied to this line, as a percentage. 20 = +20%. */
  markupPct?: number;
  /** True = a one-off custom item not backed by the catalogue. */
  isCustom?: boolean;
  customName?: string;
  /** Per-unit material cost for a custom item. */
  customCostMinor?: MinorUnits;
  /** Base labor hours for a custom item. */
  customLaborHours?: number;
  /** Fixed labour amount for a custom item, independent of hourly rate. Overrides hours x rate when set. */
  customLaborFlatMinor?: MinorUnits;
}

// ─────────────────────────────────────────────────────────────────────────
// Line items & estimates
// ─────────────────────────────────────────────────────────────────────────

export interface LineItem {
  id: string;
  /** Free-text description shown to the client. */
  description: string;
  /** Source assembly, if this line was added from one. */
  sourceAssemblyId?: string;
  /** Project Mode physical location, null/undefined for Quick-Quote. */
  locationId?: string;

  /** Discrete quantity (e.g. 3 sockets). Mutually used with quantityMeters. */
  quantity?: number;
  /** Linear quantity in metres for containment runs (spec §3.3). */
  quantityMeters?: number;

  /**
   * Snapshot of resolved per-unit material cost AT ADD TIME (spec §5.4).
   * For SENT/SIGNED estimates this is authoritative and frozen.
   * For DRAFTs the engine can recompute from live data and compare.
   */
  resolvedMaterialCostMinor: MinorUnits;

  /** Base labor hours for this line before toggles. */
  laborBaseHours: number;

  overrides?: LineItemOverrides;

  /** IDs of line-level toggles applied to this line. */
  appliedLaborToggleIds: string[];
}

export type EstimateStatus = 'draft' | 'sent' | 'approved' | 'declined' | 'signed';
export type EstimateMode = 'quick' | 'project';

// ─────────────────────────────────────────────────────────────────────────
// Project Mode (spec §3.3): physical location hierarchy.
// A Location is a node in a tree — Project › Floor/Area › Room › ...
// parentId === undefined means the node sits at the project root.
// ─────────────────────────────────────────────────────────────────────────

export interface SnagItem {
  id: string;
  projectId: string;
  /** The floor or room this snag relates to, if any. */
  locationId?: string;
  description: string;
  resolved: boolean;
  photoPath?: string;
  /** Optional note on how the snag was fixed, set when marking it resolved. */
  resolutionNote?: string;
  /** Optional "after" photo showing the fix, alongside the original (before) photoPath. */
  resolvedPhotoPath?: string;
  sortOrder: number;
  createdAt: number;
}

export interface Project {
  id: string;
  name: string;
  clientName?: string;
  createdAt: number; // Unix ms
}

export interface Location {
  id: string;
  projectId: string;
  /** Parent location id; undefined = top-level (floor/area under the project). */
  parentId?: string;
  name: string;
  /** Ordering among siblings. */
  sortOrder: number;
  /** Ceiling height in metres, manually entered (a 2D plan carries no height). */
  heightMeters?: number;
}

// ─────────────────────────────────────────────────────────────────────────
// Floor plans, traced walls, and tagged electrical symbols.
// A FloorPlan is one imported image per floor (top-level Location). A Wall
// is a line segment traced on that plan, belonging to a room (nested
// Location) and pointing at its one reference Photo. A WallSymbol is a
// tagged electrical symbol on a wall, positioned normalized (0-1) along the
// wall (shared between the plan and the wall's photo) and, separately, at a
// normalized (0-1) vertical position within the photo only (the plan is
// top-down and carries no height information).
// ─────────────────────────────────────────────────────────────────────────

export interface FloorPlan {
  id: string;
  projectId: string;
  /** The floor (top-level Location) this plan belongs to. */
  locationId: string;
  filePath: string;
  width: number;
  height: number;
  createdAt: number;
  /** Real-world scale from a user calibration tap, in pixels per metre (at width/height above). */
  pxPerMeter?: number;
}

export interface Wall {
  id: string;
  floorPlanId: string;
  /** The room (nested Location) this wall belongs to. */
  locationId: string;
  /** Normalized 0-1 endpoints on the floor plan image. */
  start: { x: number; y: number };
  end: { x: number; y: number };
  label?: string;
  /** The one reference photo for this wall, once captured. */
  photoId?: string;
  sortOrder: number;
  createdAt: number;
}

export interface WallSymbol {
  id: string;
  wallId: string;
  type: SymbolType;
  /** 0-1 position along the wall, shared/projected between plan and photo. */
  positionAlongWall: number;
  /** 0-1 vertical position within the wall's photo only. */
  photoY: number;
  color?: string;
  createdAt: number;
}

export interface Estimate {
  id: string;
  mode: EstimateMode;
  status: EstimateStatus;
  currency: Currency;
  /** Labor rate in minor units per hour. From WorkspaceConfig. */
  hourlyRateMinor: MinorUnits;
  lineItems: LineItem[];
  /** IDs of estimate-wide toggles (e.g. out-of-hours). */
  appliedLaborToggleIds: string[];
  /** VAT rate as a percentage, e.g. 20 for UK standard. 0 = no VAT line. */
  vatRatePct: number;
  /** Whether the client PDF shows the Materials/Labour split (true) or just the total. */
  showLaborBreakdown?: boolean;
}
