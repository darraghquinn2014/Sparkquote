import { describe, it, expect, vi } from 'vitest';

// annotation-service.ts pulls in expo-file-system/legacy for its save/load-to-disk
// functions (unrelated to the pure path-geometry helpers under test here), which
// in turn drags in react-native's Flow-typed source — stub it out so this file
// stays a pure-logic unit test with no native/module bundling involved.
vi.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///mock/',
  makeDirectoryAsync: vi.fn(),
  writeAsStringAsync: vi.fn(),
  readAsStringAsync: vi.fn(),
  getInfoAsync: vi.fn(),
  deleteAsync: vi.fn(),
}));

import { eraseStrokeSegments, parseStrokePoints, buildStrokePath } from '../annotation-service';
import type { AnnotationStroke } from '../annotation-service';

const straightLine = (): AnnotationStroke => ({
  color: '#FFFFFF',
  width: 0.01,
  path: buildStrokePath([
    { x: 0, y: 0.5 }, { x: 0.2, y: 0.5 }, { x: 0.4, y: 0.5 },
    { x: 0.6, y: 0.5 }, { x: 0.8, y: 0.5 }, { x: 1, y: 0.5 },
  ]),
});

describe('eraseStrokeSegments', () => {
  it('leaves the stroke untouched when the eraser path is nowhere near it', () => {
    const result = eraseStrokeSegments(straightLine(), [{ x: 0.5, y: 0.9 }], 0.02);
    expect(result).toHaveLength(1);
    expect(result[0]!.path).toBe(straightLine().path);
  });

  it('splits a line into two remaining pieces when erasing the middle', () => {
    const result = eraseStrokeSegments(straightLine(), [{ x: 0.4, y: 0.5 }], 0.05);
    expect(result).toHaveLength(2);
    const firstPoints = parseStrokePoints(result[0]!.path);
    const secondPoints = parseStrokePoints(result[1]!.path);
    expect(firstPoints[firstPoints.length - 1]!.x).toBeLessThan(0.4);
    expect(secondPoints[0]!.x).toBeGreaterThan(0.4);
  });

  it('shortens the line when erasing an end, without splitting it', () => {
    const result = eraseStrokeSegments(straightLine(), [{ x: 0, y: 0.5 }], 0.05);
    expect(result).toHaveLength(1);
    const points = parseStrokePoints(result[0]!.path);
    expect(points[0]!.x).toBeGreaterThan(0);
  });

  it('removes the whole stroke when every point falls within the erase radius', () => {
    const result = eraseStrokeSegments(straightLine(), [{ x: 0.5, y: 0.5 }], 1);
    expect(result).toEqual([]);
  });

  it('drops leftover runs shorter than 2 points, even if not every point was erased', () => {
    const sparse: AnnotationStroke = {
      color: '#fff',
      width: 0.01,
      path: buildStrokePath([{ x: 0, y: 0 }, { x: 0.01, y: 0 }, { x: 1, y: 0 }]),
    };
    // Erases only the middle point — both remaining sides are lone points
    // (can't form a renderable line on their own), so the whole thing goes.
    const result = eraseStrokeSegments(sparse, [{ x: 0.01, y: 0 }], 0.005);
    expect(result).toEqual([]);
  });

  it('returns the stroke unchanged when the eraser path is empty', () => {
    const result = eraseStrokeSegments(straightLine(), [], 0.05);
    expect(result).toHaveLength(1);
  });
});
