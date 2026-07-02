/**
 * Wall/floor-plan geometry.
 *
 * Pure math shared by the floor-plan viewer and the wall-photo screen: given
 * a wall traced as a line segment (normalized 0-1 on the plan image), find
 * which wall a tap belongs to and where along it, then map that position
 * back onto either the plan image or a wall's photo.
 *
 * All coordinates in this module are normalized (0-1), independent of any
 * particular render size/zoom — the UI converts to/from actual pixels via
 * containerPointToImageNorm/imageNormToContainerPoint, which additionally
 * account for contentFit="contain" letterboxing (the image not filling its
 * container edge-to-edge when aspect ratios differ).
 */

export interface Point {
  x: number;
  y: number;
}

export interface WallSegment {
  start: Point;
  end: Point;
}

export interface Size {
  width: number;
  height: number;
}

function clamp01(t: number): number {
  return Math.max(0, Math.min(1, t));
}

/**
 * Project a point onto a wall's line segment. Returns the normalized position
 * along the segment (0 = start, 1 = end, clamped) and the perpendicular
 * distance from the input point to the closest point on the segment — both
 * in the same normalized plan-space units as the inputs.
 */
export function projectPointToWall(
  point: Point,
  wall: WallSegment,
): { positionAlongWall: number; distance: number } {
  const dx = wall.end.x - wall.start.x;
  const dy = wall.end.y - wall.start.y;
  const lengthSq = dx * dx + dy * dy;

  const positionAlongWall =
    lengthSq === 0 ? 0 : clamp01(((point.x - wall.start.x) * dx + (point.y - wall.start.y) * dy) / lengthSq);

  const closest: Point = {
    x: wall.start.x + dx * positionAlongWall,
    y: wall.start.y + dy * positionAlongWall,
  };
  const distance = Math.hypot(point.x - closest.x, point.y - closest.y);

  return { positionAlongWall, distance };
}

/** Max distance (fraction of the plan's diagonal) for a tap to "snap" to a wall. */
export const NEAREST_WALL_MAX_DISTANCE = 0.05;

/**
 * Find the nearest wall to a tapped point among a set of walls (e.g. every
 * wall on a floor plan). Returns null if there are no walls to consider —
 * the caller applies NEAREST_WALL_MAX_DISTANCE to decide whether the match
 * is close enough to use.
 */
export function findNearestWall<T extends WallSegment>(
  point: Point,
  walls: T[],
): { wall: T; positionAlongWall: number; distance: number } | null {
  let best: { wall: T; positionAlongWall: number; distance: number } | null = null;

  for (const wall of walls) {
    const { positionAlongWall, distance } = projectPointToWall(point, wall);
    if (best === null || distance < best.distance) {
      best = { wall, positionAlongWall, distance };
    }
  }

  return best;
}

/** Lerp a normalized position (0-1) back into a point along the wall segment. */
export function wallPointAt(wall: WallSegment, t: number): Point {
  return {
    x: wall.start.x + (wall.end.x - wall.start.x) * t,
    y: wall.start.y + (wall.end.y - wall.start.y) * t,
  };
}

/** Normalized (0-1) plan coordinate -> pixel coordinate at a given render size. */
export function planToPixel(point: Point, planSize: Size): Point {
  return { x: point.x * planSize.width, y: point.y * planSize.height };
}

/** Pixel coordinate -> normalized (0-1) plan coordinate at a given render size. */
export function pixelToPlan(point: Point, planSize: Size): Point {
  return { x: point.x / planSize.width, y: point.y / planSize.height };
}

/**
 * Correct a tap/point captured relative to a contentFit="contain" image's
 * CONTAINER for letterboxing, returning a normalized (0-1) point relative to
 * the visible IMAGE content. Points landing in the letterbox margin clamp to
 * the nearest edge.
 */
export function containerPointToImageNorm(point: Point, containerSize: Size, imageSize: Size): Point {
  const scale = Math.min(containerSize.width / imageSize.width, containerSize.height / imageSize.height);
  const renderedWidth = imageSize.width * scale;
  const renderedHeight = imageSize.height * scale;
  const offsetX = (containerSize.width - renderedWidth) / 2;
  const offsetY = (containerSize.height - renderedHeight) / 2;

  return {
    x: clamp01((point.x - offsetX) / renderedWidth),
    y: clamp01((point.y - offsetY) / renderedHeight),
  };
}

/** Inverse of containerPointToImageNorm — image-normalized point -> container pixel. */
export function imageNormToContainerPoint(point: Point, containerSize: Size, imageSize: Size): Point {
  const scale = Math.min(containerSize.width / imageSize.width, containerSize.height / imageSize.height);
  const renderedWidth = imageSize.width * scale;
  const renderedHeight = imageSize.height * scale;
  const offsetX = (containerSize.width - renderedWidth) / 2;
  const offsetY = (containerSize.height - renderedHeight) / 2;

  return {
    x: offsetX + point.x * renderedWidth,
    y: offsetY + point.y * renderedHeight,
  };
}

/** Horizontal pixel position on a wall's photo for a given position along the wall. */
export function symbolPhotoX(positionAlongWall: number, photoWidthPx: number): number {
  return positionAlongWall * photoWidthPx;
}

/** Default vertical position (mid-height) for a symbol newly tagged from the plan. */
export const DEFAULT_PHOTO_Y = 0.5;
