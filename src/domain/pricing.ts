/**
 * PricingEngine (spec §5, §6) — the central, fixed pricing pipeline.
 *
 * ORDER OF OPERATIONS for a single line (defined ONCE here, never re-derived
 * in the UI — this is the §6 Build risk):
 *
 *   1. Determine per-unit material cost:
 *        - custom item        → overrides.customCostMinor
 *        - override unit cost → overrides.unitCostMinor
 *        - otherwise          → line.resolvedMaterialCostMinor (snapshot/live)
 *   2. Multiply by quantity (discrete) or quantityMeters (linear).
 *   3. Apply line markup %, if any, to the MATERIAL subtotal.
 *   4. Compute labor separately (LaborEngine) from base hours × hourly rate
 *      × applicable toggles. Markup does NOT apply to labor by default.
 *   5. Line total = marked-up material subtotal + labor cost.
 *
 * Then at the estimate level: sum line totals → apply VAT → grand total.
 *
 * Markup applies to materials only. If a business wants markup on labor too,
 * that becomes an explicit config flag later — it is NOT silently assumed.
 */

import type {
  Estimate,
  LaborToggle,
  LineItem,
  MinorUnits,
} from './types';
import { applyFactor, roundMinor, sumMinor } from './money';
import { computeLabor, type LaborResult } from './labor';

export interface LinePriceBreakdown {
  lineId: string;
  /** Per-unit material cost actually used (after custom/override resolution). */
  unitMaterialCostMinor: MinorUnits;
  /** Effective quantity used (discrete count or metres). */
  effectiveQuantity: number;
  /** Material subtotal before markup. */
  materialSubtotalMinor: MinorUnits;
  /** Markup amount added to materials (0 if none). */
  markupAmountMinor: MinorUnits;
  /** Material subtotal after markup. */
  materialTotalMinor: MinorUnits;
  labor: LaborResult;
  /** materialTotal + labor.costMinor */
  lineTotalMinor: MinorUnits;
}

export interface EstimatePriceBreakdown {
  lines: LinePriceBreakdown[];
  /** Sum of all line totals, before VAT. */
  subtotalMinor: MinorUnits;
  /** Sum of all lines' marked-up material totals. */
  materialsTotalMinor: MinorUnits;
  /** Sum of all lines' labour costs. */
  laborTotalMinor: MinorUnits;
  vatAmountMinor: MinorUnits;
  /** subtotal + VAT. */
  grandTotalMinor: MinorUnits;
}

/** Resolve the effective quantity for a line (discrete or linear metres). */
function effectiveQuantity(line: LineItem): number {
  if (line.quantityMeters != null) return line.quantityMeters;
  if (line.quantity != null) return line.quantity;
  return 1; // a line with neither defaults to a single unit
}

/** Resolve the per-unit material cost for a line, honouring overrides. */
function unitMaterialCost(line: LineItem): MinorUnits {
  const o = line.overrides;
  if (o?.isCustom) {
    return o.customCostMinor ?? 0;
  }
  if (o?.unitCostMinor != null) {
    return o.unitCostMinor;
  }
  return line.resolvedMaterialCostMinor;
}

/** Resolve the base labor hours for a line, honouring a custom item. */
function baseLaborHours(line: LineItem): number {
  const o = line.overrides;
  if (o?.isCustom && o.customLaborHours != null) {
    return o.customLaborHours;
  }
  return line.laborBaseHours;
}

/**
 * Price a single line.
 *
 * @param line          the line item
 * @param hourlyRateMinor labor rate (minor units/hour)
 * @param toggleIndex   map of toggleId → LaborToggle (all known toggles)
 * @param estimateWideToggleIds toggles applied to the whole estimate
 */
export function priceLine(
  line: LineItem,
  hourlyRateMinor: MinorUnits,
  toggleIndex: Map<string, LaborToggle>,
  estimateWideToggleIds: string[],
): LinePriceBreakdown {
  const unit = unitMaterialCost(line);
  const qty = effectiveQuantity(line);
  if (qty < 0) throw new Error(`Quantity cannot be negative on line ${line.id}`);

  const materialSubtotal = roundMinor(unit * qty);

  const markupPct = line.overrides?.markupPct ?? 0;
  const materialTotal = applyFactor(materialSubtotal, 1 + markupPct / 100);
  const markupAmount = materialTotal - materialSubtotal;

  // Resolve which toggles apply to this line: estimate-wide toggles that
  // apply at estimate level, plus this line's own line-level toggles.
  const applicableToggles = resolveToggles(
    line.appliedLaborToggleIds,
    estimateWideToggleIds,
    toggleIndex,
  );

  let labor = computeLabor(baseLaborHours(line), hourlyRateMinor, applicableToggles);
  const flatLabor = line.overrides?.customLaborFlatMinor;
  if (flatLabor != null) labor = { ...labor, costMinor: flatLabor, hours: 0 };

  return {
    lineId: line.id,
    unitMaterialCostMinor: unit,
    effectiveQuantity: qty,
    materialSubtotalMinor: materialSubtotal,
    markupAmountMinor: markupAmount,
    materialTotalMinor: materialTotal,
    labor,
    lineTotalMinor: materialTotal + labor.costMinor,
  };
}

/**
 * Resolve the set of toggles that apply to a line.
 * - estimate-wide toggle IDs contribute only if the toggle's appliesTo is
 *   'estimate'.
 * - line toggle IDs contribute only if appliesTo is 'line'.
 * Unknown IDs are ignored defensively (a deleted toggle shouldn't crash a quote).
 */
export function resolveToggles(
  lineToggleIds: string[],
  estimateWideToggleIds: string[],
  toggleIndex: Map<string, LaborToggle>,
): LaborToggle[] {
  const result: LaborToggle[] = [];

  for (const id of estimateWideToggleIds) {
    const t = toggleIndex.get(id);
    if (t && t.appliesTo === 'estimate') result.push(t);
  }
  for (const id of lineToggleIds) {
    const t = toggleIndex.get(id);
    if (t && t.appliesTo === 'line') result.push(t);
  }
  return result;
}

/** Price an entire estimate. */
export function priceEstimate(
  estimate: Estimate,
  toggles: LaborToggle[],
): EstimatePriceBreakdown {
  const toggleIndex = new Map(toggles.map((t) => [t.id, t]));

  const lines = estimate.lineItems.map((line) =>
    priceLine(line, estimate.hourlyRateMinor, toggleIndex, estimate.appliedLaborToggleIds),
  );

  const subtotal = sumMinor(lines.map((l) => l.lineTotalMinor));
  const materialsTotal = sumMinor(lines.map((l) => l.materialTotalMinor));
  const laborTotal = sumMinor(lines.map((l) => l.labor.costMinor));
  const vatAmount = applyFactor(subtotal, estimate.vatRatePct / 100);

  return {
    lines,
    subtotalMinor: subtotal,
    materialsTotalMinor: materialsTotal,
    laborTotalMinor: laborTotal,
    vatAmountMinor: vatAmount,
    grandTotalMinor: subtotal + vatAmount,
  };
}
