import * as FileSystem from 'expo-file-system/legacy';
import {
  containerPointToImageNorm, imageNormToContainerPoint, imageFitRect,
  type Point, type Size,
} from '@/src/domain/wall-geometry';

export interface AnnotationStroke {
  color: string;
  /** Fraction of the photo's own (letterbox-excluded) rendered width — NOT screen pixels. */
  width: number;
  // SVG path string "M x y L x y ...", where x/y are normalized 0-1 relative
  // to the photo's own image content (not any particular container's raw
  // pixels) — see normalizeStroke/denormalizeStroke below. This is what lets
  // the same stroke render correctly in both the annotation editor's canvas
  // (squeezed by its header/toolbar) and the room lightbox (full screen),
  // which are different sizes/letterbox amounts for the same photo.
  path: string;
}

export type SymbolType =
  | 'socket'
  | 'switch'
  | 'ceiling_rose'
  | 'downlight'
  | 'consumer_unit'
  | 'junction_box'
  | 'smoke_detector'
  | 'fan';

export interface PlacedSymbol {
  id: string;
  type: SymbolType;
  /** Normalized 0-1, relative to the photo's own image content — see AnnotationStroke's path comment. */
  x: number;
  y: number;
  color: string;
}

/** Parse an "M x y L x y L x y ..." path string into its point list. */
export function parseStrokePoints(path: string): Point[] {
  const nums = (path.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
  const points: Point[] = [];
  for (let i = 0; i + 1 < nums.length; i += 2) points.push({ x: nums[i]!, y: nums[i + 1]! });
  return points;
}

/** Inverse of parseStrokePoints. */
export function buildStrokePath(points: Point[]): string {
  if (points.length === 0) return '';
  const [first, ...rest] = points;
  return (
    `M ${first!.x.toFixed(4)} ${first!.y.toFixed(4)}` +
    rest.map((p) => ` L ${p.x.toFixed(4)} ${p.y.toFixed(4)}`).join('')
  );
}

/** Convert a freshly-drawn stroke (raw container pixels) into its stored, normalized form. */
export function normalizeStroke(
  rawPath: string,
  rawWidth: number,
  containerSize: Size,
  imageSize: Size,
): { path: string; width: number } {
  const points = parseStrokePoints(rawPath).map((p) => containerPointToImageNorm(p, containerSize, imageSize));
  const fit = imageFitRect(containerSize, imageSize);
  return { path: buildStrokePath(points), width: rawWidth / fit.width };
}

/** Convert a stored (normalized) stroke into pixel coordinates for a specific container. */
export function denormalizeStroke(stroke: AnnotationStroke, containerSize: Size, imageSize: Size): AnnotationStroke {
  const points = parseStrokePoints(stroke.path).map((p) => imageNormToContainerPoint(p, containerSize, imageSize));
  const fit = imageFitRect(containerSize, imageSize);
  return { ...stroke, path: buildStrokePath(points), width: stroke.width * fit.width };
}

/** Convert a freshly-placed symbol's raw container-pixel tap into its stored, normalized point. */
export function normalizeSymbolPoint(x: number, y: number, containerSize: Size, imageSize: Size): Point {
  return containerPointToImageNorm({ x, y }, containerSize, imageSize);
}

/** Convert a stored (normalized) symbol into pixel coordinates for a specific container. */
export function denormalizeSymbol(symbol: PlacedSymbol, containerSize: Size, imageSize: Size): PlacedSymbol {
  const p = imageNormToContainerPoint({ x: symbol.x, y: symbol.y }, containerSize, imageSize);
  return { ...symbol, x: p.x, y: p.y };
}

export interface PhotoAnnotations {
  photoId: string;
  strokes: AnnotationStroke[];
  symbols: PlacedSymbol[];
  savedAt: number;
}

function annotationPath(photoId: string): string {
  return `${FileSystem.documentDirectory}sparkquote/annotations/${photoId}.json`;
}

export async function saveAnnotations(
  photoId: string,
  strokes: AnnotationStroke[],
  symbols: PlacedSymbol[] = [],
): Promise<void> {
  const dir = `${FileSystem.documentDirectory}sparkquote/annotations/`;
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  const data: PhotoAnnotations = { photoId, strokes, symbols, savedAt: Date.now() };
  await FileSystem.writeAsStringAsync(annotationPath(photoId), JSON.stringify(data));
}

export async function loadAnnotations(
  photoId: string,
): Promise<{ strokes: AnnotationStroke[]; symbols: PlacedSymbol[] }> {
  try {
    const text = await FileSystem.readAsStringAsync(annotationPath(photoId));
    const data = JSON.parse(text) as PhotoAnnotations;
    return { strokes: data.strokes ?? [], symbols: data.symbols ?? [] };
  } catch {
    return { strokes: [], symbols: [] };
  }
}

export async function hasAnnotations(photoId: string): Promise<boolean> {
  const info = await FileSystem.getInfoAsync(annotationPath(photoId));
  return info.exists;
}

export async function deleteAnnotations(photoId: string): Promise<void> {
  await FileSystem.deleteAsync(annotationPath(photoId), { idempotent: true });
}
