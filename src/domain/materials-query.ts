/**
 * Materials-for-room lookup — answers "what materials are needed in room X?"
 * from an already-loaded project estimate. Pure and testable; the voice/UI
 * layer (GlobalVoiceControl) only resolves the room and calls in here.
 */

import type { LineItem } from './types';

/**
 * A labour-only line has no material of its own — it's added via
 * LabourSheet with either fixed hours or a flat amount, carried entirely in
 * overrides rather than quantity/resolvedMaterialCostMinor.
 */
export function isLabourOnlyLine(line: LineItem): boolean {
  return line.overrides?.customLaborHours != null || line.overrides?.customLaborFlatMinor != null;
}

/** Material (non-labour) lines assigned to one specific room/location. */
export function materialLinesForLocation(lines: LineItem[], locationId: string): LineItem[] {
  return lines.filter((l) => l.locationId === locationId && !isLabourOnlyLine(l));
}

/**
 * Matches the on-screen line rendering convention in app/project/quote/[id].tsx:
 * description, plus a quantity suffix only when there's something to show
 * (metres always shown, a discrete count only when it isn't the implicit 1).
 */
export function formatMaterialLineSummary(line: LineItem): string {
  if (line.quantityMeters != null) return `${line.description} (${line.quantityMeters}m)`;
  if (line.quantity != null && line.quantity !== 1) return `${line.description} (×${line.quantity})`;
  return line.description;
}
