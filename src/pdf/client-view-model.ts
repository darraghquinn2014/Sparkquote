/**
 * Client view-model (spec §10) — the margin-protection boundary.
 *
 * A priced estimate contains everything: per-line material cost, markup amount,
 * labour breakdown, internal photos. The CLIENT must see none of that internal
 * detail — only line descriptions, quantities, line totals, and the summary.
 *
 * This transform is the single place that decides what leaves the building. It
 * is built so that internal data has NO PATH into the client view: the output
 * type simply has no field for markup, unit cost, or photos. You cannot leak
 * what the structure cannot carry. This is enforced by tests, because a leak
 * here exposes the electrician's margins to their customer.
 */

import type { Currency, Estimate } from '../domain/types';
import type { EstimatePriceBreakdown } from '../domain/pricing';

/** What a client is allowed to see for one line. */
export interface ClientLine {
  description: string;
  /** Human-readable quantity, e.g. "3" or "12 m". */
  quantityLabel: string;
  /** The all-in line total only — never the material/labour/markup split. */
  lineTotalMinor: number;
}

export interface ClientEstimate {
  currency: Currency;
  lines: ClientLine[];
  subtotalMinor: number;
  vatRatePct: number;
  vatAmountMinor: number;
  grandTotalMinor: number;
  /** Optional single labour figure shown as an "includes labour" note. Materials are NEVER broken out. */
  laborTotalMinor?: number;
  /** Optional business/client identity for the document header. */
  businessName?: string;
  clientName?: string;
  reference?: string;
  dateIso?: string;
}

export interface ClientEstimateMeta {
  businessName?: string;
  clientName?: string;
  reference?: string;
  dateIso?: string;
}

function quantityLabel(quantity?: number, quantityMeters?: number): string {
  if (quantityMeters != null) return `${quantityMeters} m`;
  if (quantity != null) return String(quantity);
  return '1';
}

/**
 * Build the client-facing view model from a priced estimate.
 *
 * Takes the engine's breakdown for totals but copies ONLY client-safe fields
 * into the output. Internal numbers (unitMaterialCostMinor, markupAmountMinor,
 * labor.*) are read for nothing and never carried forward.
 */
export function toClientEstimate(
  estimate: Estimate,
  pricing: EstimatePriceBreakdown,
  meta: ClientEstimateMeta = {},
): ClientEstimate {
  const lineById = new Map(estimate.lineItems.map((l) => [l.id, l]));

  const lines: ClientLine[] = pricing.lines.map((b) => {
    const src = lineById.get(b.lineId);
    return {
      description: src?.description ?? '',
      quantityLabel: quantityLabel(src?.quantity, src?.quantityMeters),
      lineTotalMinor: b.lineTotalMinor, // the all-in total ONLY
    };
  });

  const result: ClientEstimate = {
    currency: estimate.currency,
    lines,
    subtotalMinor: pricing.subtotalMinor,
    vatRatePct: estimate.vatRatePct,
    vatAmountMinor: pricing.vatAmountMinor,
    grandTotalMinor: pricing.grandTotalMinor,
  };
  if (estimate.showLaborBreakdown) result.laborTotalMinor = pricing.laborTotalMinor;
  if (meta.businessName != null) result.businessName = meta.businessName;
  if (meta.clientName != null) result.clientName = meta.clientName;
  if (meta.reference != null) result.reference = meta.reference;
  if (meta.dateIso != null) result.dateIso = meta.dateIso;
  return result;
}
