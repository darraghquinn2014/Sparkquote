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
  /** Set when work on this snag begins (the "in progress" state), before it's resolved. */
  startedAt?: number;
  /** Set when the snag is marked resolved; cleared if it's reopened. */
  resolvedAt?: number;
}

/** A timestamped progress-log entry on a snag, e.g. "waiting on socket delivery". */
export interface SnagNote {
  id: string;
  snagItemId: string;
  text: string;
  createdAt: number;
}

// ─────────────────────────────────────────────────────────────────────────
// Certificates (EICR/BS7671 feature): compliance paperwork for electrical
// work, distinct from the client-facing quote/estimate. Minor Works and EIC
// are modelled so far — the report's recommended build order is Minor Works
// → EIC → EICR, in rising complexity. `Certificate` is a discriminated union
// on `type` so each certificate's `fields` shape is properly narrowed.
//
// IMPORTANT: field set and wording are a first pass based on the standard
// BS7671 Model Form layouts, NOT yet reviewed by a qualified electrician.
// Do not treat generated certificates as compliant until that review happens
// (see the "before shipping" caveat in the competitive-landscape report).
// ─────────────────────────────────────────────────────────────────────────

export type CertificateType = 'minorWorks' | 'eic' | 'eicr';
export type CertificateStatus = 'draft' | 'completed';
export type SystemEarthing = 'TN-S' | 'TN-C-S' | 'TT' | 'Other';

export interface MinorWorksTestResults {
  /** Continuity of protective conductors, in Ω. */
  continuityOhms?: number;
  /** Insulation resistance Line-Neutral, in MΩ. */
  insulationResistanceLNMOhms?: number;
  /** Insulation resistance Line-Earth, in MΩ. */
  insulationResistanceLEMOhms?: number;
  /** Insulation resistance Neutral-Earth, in MΩ. */
  insulationResistanceNEMOhms?: number;
  polaritySatisfactory?: boolean;
  /** Earth fault loop impedance Zs, in Ω. */
  zsOhms?: number;
  /** RCD rated residual operating current, in mA (if applicable). */
  rcdRatedMa?: number;
  /** RCD disconnection time, in ms (if applicable). */
  rcdDisconnectionTimeMs?: number;
}

export interface MinorWorksFields {
  clientName?: string;
  clientAddress?: string;
  /** What the minor work involved (e.g. "Replaced socket outlet in kitchen"). */
  descriptionOfWork: string;
  /** ISO date the work was completed. */
  dateCompleted?: string;
  systemEarthing?: SystemEarthing;
  /** e.g. "BS EN 60898 Type B, 32A". */
  protectiveDeviceType?: string;
  protectiveDeviceRatingA?: number;
  /** Comments on the adequacy of the existing installation's earthing/bonding etc. */
  existingInstallationComments?: string;
  testResults: MinorWorksTestResults;
  /** Free-text comments, e.g. departures from BS7671 or limitations of the work. */
  comments?: string;
  /** Name of the person responsible for the work (the declaration signatory). */
  signedByName?: string;
  signedForCompany?: string;
  /** Recommended interval, in years, before the next inspection/EICR. */
  nextInspectionRecommendedYears?: number;
}

// ─────────────────────────────────────────────────────────────────────────
// EIC (Electrical Installation Certificate): for new installations or full
// circuit alterations. Model Form 1 normally has three separate signatories
// (Design / Construction / Inspection & Testing) since large jobs can split
// those roles across parties — SIMPLIFIED here to one signature covering
// whichever roles are checked, since SparkQuote's target user (a solo/small
// electrician) is almost always all three. The Schedule of Inspections
// (the ~50-item visual-check checklist in the real Model Form 1) is NOT
// modelled yet — only the Schedule of Test Results (per-circuit) is, and
// only its most decision-relevant columns, since a full multi-column
// spreadsheet-style schedule doesn't work on a phone screen anyway.
// ─────────────────────────────────────────────────────────────────────────

export interface EicCircuit {
  /** Client-generated id (not a DB row) — used as the React key and for edit/remove within the fields_json array. */
  id: string;
  circuitNumber?: string;
  description: string;
  /** e.g. "PVC/PVC T&E". */
  wiringType?: string;
  csaLineMm2?: number;
  csaCpcMm2?: number;
  /** e.g. "BS EN 60898 Type B". */
  protectiveDeviceType?: string;
  protectiveDeviceRatingA?: number;
  maxPermittedZsOhms?: number;
  /** Measured continuity (R1+R2 or R2), in Ω. */
  continuityOhms?: number;
  insulationResistanceMOhms?: number;
  polaritySatisfactory?: boolean;
  measuredZsOhms?: number;
  rcdRatedMa?: number;
  rcdDisconnectionTimeMs?: number;
}

export interface EicSupplyCharacteristics {
  systemEarthing?: SystemEarthing;
  /** e.g. "1-phase, 2-wire". */
  numberAndTypeOfLiveConductors?: string;
  nominalVoltageV?: number;
  nominalFrequencyHz?: number;
  prospectiveFaultCurrentKa?: number;
  /** External earth fault loop impedance (Ze), in Ω. */
  externalLoopImpedanceZeOhms?: number;
  supplyProtectiveDeviceType?: string;
  supplyProtectiveDeviceRatingA?: number;
}

export interface EicOriginParticulars {
  meansOfEarthing?: string;
  maximumDemandA?: number;
  mainSwitchType?: string;
  mainSwitchRatingA?: number;
  earthingConductorCsaMm2?: number;
  mainBondingConductorsCsaMm2?: number;
}

export type EicInstallationType = 'new' | 'alteration' | 'addition';

export interface EicFields {
  clientName?: string;
  clientAddress?: string;
  /** If different from the client address. */
  installationAddress?: string;
  installationType?: EicInstallationType;
  /** Extent of the installation covered by this certificate. */
  descriptionOfInstallation: string;
  /** ISO date the work was completed. */
  dateCompleted?: string;
  supply: EicSupplyCharacteristics;
  origin: EicOriginParticulars;
  circuits: EicCircuit[];
  /** Free-text comments, e.g. departures from BS7671 or limitations of the work. */
  comments?: string;
  declarationRoles: { design: boolean; construction: boolean; inspectionAndTesting: boolean };
  signedByName?: string;
  signedForCompany?: string;
  /** Recommended interval, in years, before the next inspection/EICR. */
  nextInspectionRecommendedYears?: number;
}

// ─────────────────────────────────────────────────────────────────────────
// EICR (Electrical Installation Condition Report): periodic inspection of an
// EXISTING installation, not new work. Reuses EicSupplyCharacteristics /
// EicOriginParticulars / EicCircuit wholesale, since an EICR tests the same
// physical characteristics an EIC would certify — genuinely identical
// shapes, not a coincidental reuse. The two things an EICR adds that an EIC
// doesn't: a reason/condition/overall-assessment section, and the
// observations list (C1/C2/C3/FI) below, which is the single highest-stakes
// part of this whole feature — a miscoded observation is a real-world safety
// and legal issue, not just a bug. Declaration is simpler than the EIC's
// (one inspector, not three roles), matching the real Model Form.
// ─────────────────────────────────────────────────────────────────────────

/** C1 = Danger present, C2 = Potentially dangerous, C3 = Improvement recommended, FI = Further investigation required. */
export type ObservationCode = 'C1' | 'C2' | 'C3' | 'FI';

export interface EicrObservation {
  /** Client-generated id (not a DB row) — React key / edit-remove within the fields_json array. */
  id: string;
  itemNumber?: string;
  description: string;
  code: ObservationCode;
}

export type EicrReportReason = 'periodic' | 'changeOfOccupancy' | 'preSaleOrPurchase' | 'other';
export type EicrOverallAssessment = 'satisfactory' | 'unsatisfactory';

export interface EicrFields {
  clientName?: string;
  clientAddress?: string;
  installationAddress?: string;
  reasonForReport?: EicrReportReason;
  /** Estimated age of the installation, in years. */
  estimatedAgeYears?: number;
  evidenceOfAlterations?: boolean;
  /** ISO date of the previous inspection, if known. */
  dateOfLastInspection?: string;
  /** What was inspected/tested, and any agreed or operational limitations (e.g. areas not accessible). */
  extentAndLimitations?: string;
  supply: EicSupplyCharacteristics;
  origin: EicOriginParticulars;
  circuits: EicCircuit[];
  observations: EicrObservation[];
  /** Free-text summary of the installation's general condition. */
  generalCondition?: string;
  overallAssessment?: EicrOverallAssessment;
  /** Free-text comments, e.g. departures from BS7671 or limitations of the inspection. */
  comments?: string;
  signedByName?: string;
  signedForCompany?: string;
  /** Recommended interval, in years, before the next inspection. */
  nextInspectionRecommendedYears?: number;
}

interface CertificateBase {
  id: string;
  projectId: string;
  /** The room/circuit this certificate relates to, if any. */
  locationId?: string;
  status: CertificateStatus;
  createdAt: number;
  updatedAt: number;
}

export interface MinorWorksCertificate extends CertificateBase {
  type: 'minorWorks';
  fields: MinorWorksFields;
}

export interface EicCertificate extends CertificateBase {
  type: 'eic';
  fields: EicFields;
}

export interface EicrCertificate extends CertificateBase {
  type: 'eicr';
  fields: EicrFields;
}

export type Certificate = MinorWorksCertificate | EicCertificate | EicrCertificate;

export interface Project {
  id: string;
  name: string;
  clientName?: string;
  /** Physical site address, free text. */
  address?: string;
  /** GPS-captured site location — set independently of `address`, since some
   * sites (new builds) have no formal address yet. */
  latitude?: number;
  longitude?: number;
  /** Cover photo for the project, shown on the project list. */
  photoPath?: string;
  createdAt: number; // Unix ms
  /** Set when the project is marked finished; cleared if reopened. */
  finishedAt?: number;
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
  /** Room footprint from the photo-based Measure Room flow (reference-object pixel ratio, not the wall-trace floor plan). */
  lengthMeters?: number;
  widthMeters?: number;
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
  /** How this symbol was placed — manual tap (default) or an AI plan scan. */
  source?: 'manual' | 'ai';
  /** False only for AI-placed symbols whose photoY hasn't been reviewed yet. */
  heightConfirmed?: boolean;
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
