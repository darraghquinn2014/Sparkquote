/**
 * Where a wall symbol sits, in real-world metres — shown on the wall screen
 * when a symbol is tapped and burned into shared wall photos, so both always
 * agree.
 *
 * Distance along the wall needs the wall's real length (floor plan
 * calibration). Height above the floor needs the room's ceiling height and
 * assumes the photo is framed floor-to-ceiling (nothing checks that). Either
 * figure is left out when its input is missing rather than guessed.
 */

export interface SymbolPosition {
  /** 0 = one end of the wall, 1 = the other (fraction of the photo's width). */
  positionAlongWall: number;
  /** 0 = top of the photo (ceiling), 1 = bottom (floor). */
  photoY: number;
}

export interface SymbolMeasurements {
  /** Metres from each end of the wall, or null if the wall isn't calibrated. */
  fromEnds: { start: number; end: number } | null;
  /** Metres above the floor, or null if the room's ceiling height isn't set. */
  heightAboveFloor: number | null;
}

export function measureSymbol(
  symbol: SymbolPosition,
  wallLengthM: number | null | undefined,
  ceilingHeightM: number | null | undefined,
): SymbolMeasurements {
  return {
    fromEnds: wallLengthM != null
      ? { start: symbol.positionAlongWall * wallLengthM, end: (1 - symbol.positionAlongWall) * wallLengthM }
      : null,
    heightAboveFloor: ceilingHeightM != null ? (1 - symbol.photoY) * ceilingHeightM : null,
  };
}

/** One-line summary for a shared photo, e.g. "1.22m high · 3.58m / 1.39m from ends".
 * Null when neither figure can be worked out. */
export function symbolMeasurementText(m: SymbolMeasurements): string | null {
  const parts: string[] = [];
  if (m.heightAboveFloor != null) parts.push(`${m.heightAboveFloor.toFixed(2)}m high`);
  if (m.fromEnds) parts.push(`${m.fromEnds.start.toFixed(2)}m / ${m.fromEnds.end.toFixed(2)}m from ends`);
  return parts.length > 0 ? parts.join(' · ') : null;
}
