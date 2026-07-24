/**
 * Some materials are sold in a fixed-count pack rather than individually,
 * e.g. "Cable ties (bag of 100)" — priced per bag, not per tie. Same idea as
 * drum-size.ts (fixed-length cable/conduit sold by the drum), but keyed on a
 * count instead of a length, and read out of a "(word of N)" parenthetical
 * rather than a trailing "Nm Drum". No separate catalogue field for this
 * either, so it's read straight out of the description.
 */
const PACK_RE = /\((?:bag|box|pack|pk|reel|roll)s?\s+of\s+(\d+)\)/i;

export function packSize(description: string): number | null {
  const m = description.match(PACK_RE);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return n > 0 ? n : null;
}

/** Whole packs needed to cover a given count, rounded up (can't buy part of a pack). */
export function packsNeededFor(countNeeded: number, packSizeCount: number): number {
  return Math.max(1, Math.ceil(countNeeded / packSizeCount));
}
