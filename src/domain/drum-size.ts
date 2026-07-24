/**
 * Some cable/conduit items are sold as a fixed-length drum (or reel, coil,
 * box, length — real supplier catalogues use all of these) rather than cut
 * to length. The catalogue has no separate field for this, so the length is
 * read straight out of the description or unit string.
 *
 * Two shapes handled:
 *  1. "Twin & Earth 2.5mm² 100m Drum" — a number immediately before the word
 *     "Drum" somewhere in a longer description. Deliberately excludes "mm"
 *     cross-section specs (e.g. "2.5mm²") via the negative lookahead, since
 *     those aren't drum lengths.
 *  2. "100m reel" / "50m coil" / "305m box" / "2m length" — a short unit
 *     string that's just a leading length + descriptor word, as imported
 *     supplier catalogues actually use. No "drum"/cross-section ambiguity to
 *     worry about here since unit strings don't contain spec numbers, so a
 *     plain leading match is enough.
 */
export function drumLengthMeters(description: string): number | null {
  const drumIdx = description.search(/\bdrum\b/i);
  if (drumIdx !== -1) {
    const before = description.slice(0, drumIdx);
    const matches = [...before.matchAll(/(\d+(?:\.\d+)?)\s*m\b(?!m)/gi)];
    const last = matches[matches.length - 1];
    if (last) return parseFloat(last[1]);
  }
  const leading = description.match(/^(\d+(?:\.\d+)?)\s*m\b/i);
  return leading ? parseFloat(leading[1]) : null;
}

/** Whole drums needed to cover a given length, rounded up (can't buy part of a drum). */
export function drumsNeededFor(metersNeeded: number, drumLenMeters: number): number {
  return Math.max(1, Math.ceil(metersNeeded / drumLenMeters));
}
