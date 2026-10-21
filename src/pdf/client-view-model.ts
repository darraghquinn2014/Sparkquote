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

import type { Currency, Estimate, Location } from '../domain/types';
import type { EstimatePriceBreakdown } from '../domain/pricing';

/** What a client is allowed to see for one line. */
export interface ClientLine {
  description: string;
  /** Human-readable quantity, e.g. "3" or "12 m". */
  quantityLabel: string;
  /** The all-in line total only — never the material/labour/markup split. */
  lineTotalMinor: number;
}

/** A room's lines on a project quote, with the room's all-in subtotal. */
export interface ClientSection {
  title: string;
  subtotalMinor: number;
  lines: ClientLine[];
}

export interface ClientEstimate {
  currency: Currency;
  lines: ClientLine[];
  /** Project quotes only: the same lines grouped by room, in floor/room order. */
  sections?: ClientSection[];
  subtotalMinor: number;
  vatRatePct: number;
  vatAmountMinor: number;
  grandTotalMinor: number;
  /** Optional single labour figure shown as an "includes labour" note. Materials are NEVER broken out. */
  laborTotalMinor?: number;
  /** Optional business/client identity for the document header. */
  businessName?: string;
  tagline?: string;
  logoDataUri?: string;
  clientName?: string;
  reference?: string;
  dateIso?: string;
}

export interface ClientEstimateMeta {
  businessName?: string;
  tagline?: string;
  logoDataUri?: string;
  clientName?: string;
  reference?: string;
  dateIso?: string;
  /** Room heading per locationId, in display order (see roomLabels). When
   * given, lines are also grouped into per-room sections. */
  roomLabels?: Map<string, string>;
}

/** Section title for lines not assigned to a room — matches the quote screen. */
export const GENERAL_SECTION_TITLE = 'General';

/**
 * Room headings for a project's locations, floors first then their rooms in
 * the order the quote screen lists them. The floor name is only prefixed when
 * there's more than one floor ("First Floor · Bedroom 1").
 */
export function roomLabels(locations: Location[]): Map<string, string> {
  const floors = locations.filter((l) => l.parentId == null);
  const labels = new Map<string, string>();
  for (const floor of floors) {
    for (const room of locations.filter((l) => l.parentId === floor.id)) {
      labels.set(room.id, floors.length > 1 ? `${floor.name} · ${room.name}` : room.name);
    }
  }
  return labels;
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

  let sections: ClientSection[] | undefined;
  if (meta.roomLabels) {
    // Keyed by room id (two rooms can share a name); seeded in room order so
    // sections follow the floor/room layout, not the order lines were added.
    const GENERAL = '';
    const byRoom = new Map<string, ClientSection>();
    for (const [id, title] of meta.roomLabels) byRoom.set(id, { title, subtotalMinor: 0, lines: [] });
    byRoom.set(GENERAL, { title: GENERAL_SECTION_TITLE, subtotalMinor: 0, lines: [] });
    pricing.lines.forEach((b, i) => {
      const locationId = lineById.get(b.lineId)?.locationId;
      const section = byRoom.get(locationId && byRoom.has(locationId) ? locationId : GENERAL)!;
      section.lines.push(lines[i]!);
      section.subtotalMinor += b.lineTotalMinor;
    });
    sections = [...byRoom.values()].filter((s) => s.lines.length > 0);
  }

  const result: ClientEstimate = {
    currency: estimate.currency,
    lines,
    subtotalMinor: pricing.subtotalMinor,
    vatRatePct: estimate.vatRatePct,
    vatAmountMinor: pricing.vatAmountMinor,
    grandTotalMinor: pricing.grandTotalMinor,
  };
  if (sections) result.sections = sections;
  if (estimate.showLaborBreakdown) result.laborTotalMinor = pricing.laborTotalMinor;
  if (meta.businessName != null) result.businessName = meta.businessName;
  if (meta.tagline != null) result.tagline = meta.tagline;
  if (meta.logoDataUri != null) result.logoDataUri = meta.logoDataUri;
  if (meta.clientName != null) result.clientName = meta.clientName;
  if (meta.reference != null) result.reference = meta.reference;
  if (meta.dateIso != null) result.dateIso = meta.dateIso;
  return result;
}
