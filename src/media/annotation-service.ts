import * as FileSystem from 'expo-file-system/legacy';

export interface AnnotationStroke {
  color: string;
  width: number;
  path: string; // SVG path string "M x y L x y ..." in screen pixels
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
  x: number;
  y: number;
  color: string;
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
