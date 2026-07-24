/**
 * Some materials are sold in a fixed-count pack rather than individually,
 * e.g. "Cable ties (bag of 100)" — priced per bag, not per tie. Same idea as
 * drum-size.ts (fixed-length cable/conduit sold by the drum), but keyed on a
 * count instead of a length. No separate catalogue field for this, so it's
 * read straight out of the description or unit string.
 *
 * Two shapes handled:
 *  1. "Cable ties (bag of 100)" — a "(word of N)" parenthetical in a longer
 *     description.
 *  2. "box 100" / "pack 50" — a short unit string that's just a word
 *     followed by the count, no "of" and no parentheses, as imported
 *     supplier catalogues actually use.
 */
const PACK_PAREN_RE = /\((?:bag|box|pack|pk|reel|roll)s?\s+of\s+(\d+)\)/i;
const PACK_UNIT_RE = /^(?:bag|box|pack|pk|reel|roll)s?\s+(\d+)\b/i;

export function packSize(text: string): number | null {
  const paren = text.match(PACK_PAREN_RE);
  if (paren) {
    const n = parseInt(paren[1], 10);
    if (n > 0) return n;
  }
  const unit = text.match(PACK_UNIT_RE);
  if (unit) {
    const n = parseInt(unit[1], 10);
    if (n > 0) return n;
  }
  return null;
}

/** Whole packs needed to cover a given count, rounded up (can't buy part of a pack). */
export function packsNeededFor(countNeeded: number, packSizeCount: number): number {
  return Math.max(1, Math.ceil(countNeeded / packSizeCount));
}
