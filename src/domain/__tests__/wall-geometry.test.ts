import { describe, it, expect } from 'vitest';
import {
  projectPointToWall,
  findNearestWall,
  wallPointAt,
  planToPixel,
  pixelToPlan,
  containerPointToImageNorm,
  imageNormToContainerPoint,
  symbolPhotoX,
  DEFAULT_PHOTO_Y,
  type WallSegment,
} from '../wall-geometry';

describe('projectPointToWall', () => {
  it('projects onto a horizontal wall', () => {
    const wall: WallSegment = { start: { x: 0, y: 0.5 }, end: { x: 1, y: 0.5 } };
    const { positionAlongWall, distance } = projectPointToWall({ x: 0.25, y: 0.5 }, wall);
    expect(positionAlongWall).toBeCloseTo(0.25);
    expect(distance).toBeCloseTo(0);
  });

  it('projects onto a vertical wall', () => {
    const wall: WallSegment = { start: { x: 0.5, y: 0 }, end: { x: 0.5, y: 1 } };
    const { positionAlongWall, distance } = projectPointToWall({ x: 0.5, y: 0.75 }, wall);
    expect(positionAlongWall).toBeCloseTo(0.75);
    expect(distance).toBeCloseTo(0);
  });

  it('projects onto a diagonal wall', () => {
    const wall: WallSegment = { start: { x: 0, y: 0 }, end: { x: 1, y: 1 } };
    const { positionAlongWall, distance } = projectPointToWall({ x: 0.5, y: 0.5 }, wall);
    expect(positionAlongWall).toBeCloseTo(0.5);
    expect(distance).toBeCloseTo(0);
  });

  it('clamps positionAlongWall to 0 for a point before the start', () => {
    const wall: WallSegment = { start: { x: 0, y: 0 }, end: { x: 1, y: 0 } };
    const { positionAlongWall } = projectPointToWall({ x: -0.5, y: 0 }, wall);
    expect(positionAlongWall).toBe(0);
  });

  it('clamps positionAlongWall to 1 for a point past the end', () => {
    const wall: WallSegment = { start: { x: 0, y: 0 }, end: { x: 1, y: 0 } };
    const { positionAlongWall } = projectPointToWall({ x: 1.5, y: 0 }, wall);
    expect(positionAlongWall).toBe(1);
  });

  it('reports perpendicular distance for an off-wall point', () => {
    const wall: WallSegment = { start: { x: 0, y: 0 }, end: { x: 1, y: 0 } };
    const { distance } = projectPointToWall({ x: 0.5, y: 0.2 }, wall);
    expect(distance).toBeCloseTo(0.2);
  });
});

describe('findNearestWall', () => {
  const walls: WallSegment[] = [
    { start: { x: 0, y: 0 }, end: { x: 1, y: 0 } }, // top edge
    { start: { x: 0, y: 1 }, end: { x: 1, y: 1 } }, // bottom edge
    { start: { x: 0, y: 0 }, end: { x: 0, y: 1 } }, // left edge
  ];

  it('picks the correct wall among several candidates', () => {
    const result = findNearestWall({ x: 0.5, y: 0.05 }, walls);
    expect(result?.wall).toBe(walls[0]);
  });

  it('picks a different wall when closer to it', () => {
    const result = findNearestWall({ x: 0.5, y: 0.95 }, walls);
    expect(result?.wall).toBe(walls[1]);
  });

  it('returns null for an empty array', () => {
    expect(findNearestWall({ x: 0.5, y: 0.5 }, [])).toBeNull();
  });
});

describe('wallPointAt (lerp round-trip)', () => {
  it('round-trips with projectPointToWall for points on the segment', () => {
    const wall: WallSegment = { start: { x: 0.2, y: 0.3 }, end: { x: 0.8, y: 0.9 } };
    const original = wallPointAt(wall, 0.4);
    const { positionAlongWall } = projectPointToWall(original, wall);
    const roundTripped = wallPointAt(wall, positionAlongWall);
    expect(roundTripped.x).toBeCloseTo(original.x);
    expect(roundTripped.y).toBeCloseTo(original.y);
  });

  it('returns the start point at t=0 and end point at t=1', () => {
    const wall: WallSegment = { start: { x: 0.1, y: 0.2 }, end: { x: 0.9, y: 0.8 } };
    expect(wallPointAt(wall, 0)).toEqual(wall.start);
    expect(wallPointAt(wall, 1)).toEqual(wall.end);
  });
});

describe('planToPixel / pixelToPlan', () => {
  it('are inverses', () => {
    const planSize = { width: 2000, height: 1200 };
    const normPoint = { x: 0.3, y: 0.7 };
    const pixel = planToPixel(normPoint, planSize);
    const backToNorm = pixelToPlan(pixel, planSize);
    expect(backToNorm.x).toBeCloseTo(normPoint.x);
    expect(backToNorm.y).toBeCloseTo(normPoint.y);
  });
});

describe('containerPointToImageNorm / imageNormToContainerPoint', () => {
  it('round-trips for a letterboxed-wide container (image taller than container aspect)', () => {
    const containerSize = { width: 400, height: 800 };
    const imageSize = { width: 1000, height: 1000 }; // square image in a tall container -> pillarboxed
    const tap = { x: 200, y: 300 };
    const norm = containerPointToImageNorm(tap, containerSize, imageSize);
    const back = imageNormToContainerPoint(norm, containerSize, imageSize);
    expect(back.x).toBeCloseTo(tap.x);
    expect(back.y).toBeCloseTo(tap.y);
  });

  it('round-trips for a letterboxed-tall container (image wider than container aspect)', () => {
    const containerSize = { width: 800, height: 400 };
    const imageSize = { width: 1000, height: 1000 }; // square image in a wide container -> letterboxed
    const tap = { x: 500, y: 150 };
    const norm = containerPointToImageNorm(tap, containerSize, imageSize);
    const back = imageNormToContainerPoint(norm, containerSize, imageSize);
    expect(back.x).toBeCloseTo(tap.x);
    expect(back.y).toBeCloseTo(tap.y);
  });

  it('clamps taps landing in the letterbox margin to the nearest edge', () => {
    const containerSize = { width: 800, height: 400 };
    const imageSize = { width: 1000, height: 1000 };
    // Rendered image is 400x400 centered vertically (offset y = 0), so a tap
    // far to the right (in the letterbox margin) should clamp x to 1.
    const norm = containerPointToImageNorm({ x: 790, y: 200 }, containerSize, imageSize);
    expect(norm.x).toBe(1);
  });
});

describe('symbolPhotoX', () => {
  it('scales positionAlongWall by the photo width', () => {
    expect(symbolPhotoX(0.5, 1000)).toBe(500);
    expect(symbolPhotoX(0, 1000)).toBe(0);
    expect(symbolPhotoX(1, 1000)).toBe(1000);
  });
});

describe('DEFAULT_PHOTO_Y', () => {
  it('is mid-height', () => {
    expect(DEFAULT_PHOTO_Y).toBe(0.5);
  });
});
