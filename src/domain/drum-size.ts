/**
 * Some cable/conduit items are sold as a fixed-length drum rather than cut
 * to length. The catalogue has no separate field for this, so the drum's
 * length is read straight out of its description — the number immediately
 * before the word "Drum", e.g. "Twin & Earth 2.5mm² 100m Drum" -> 100.
 * Deliberately excludes "mm" cross-section specs (e.g. "2.5mm²") via the
 * negative lookahead, since those aren't drum lengths.
 */
export function drumLengthMeters(description: string): number | null {
  const drumIdx = description.search(/\bdrum\b/i);
  if (drumIdx === -1) return null;
  const before = description.slice(0, drumIdx);
  const matches = [...before.matchAll(/(\d+(?:\.\d+)?)\s*m\b(?!m)/gi)];
  const last = matches[matches.length - 1];
  return last ? parseFloat(last[1]) : null;
}

/** Whole drums needed to cover a given length, rounded up (can't buy part of a drum). */
export function drumsNeededFor(metersNeeded: number, drumLenMeters: number): number {
  return Math.max(1, Math.ceil(metersNeeded / drumLenMeters));
}
