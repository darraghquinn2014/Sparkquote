import * as FileSystem from 'expo-file-system/legacy';

export interface AnnotationStroke {
  color: string;
  width: number;
  path: string; // SVG path string "M x y L x y ..." in screen pixels
}

export interface PhotoAnnotations {
  photoId: string;
  strokes: AnnotationStroke[];
  savedAt: number;
}

function annotationPath(photoId: string): string {
  return `${FileSystem.documentDirectory}sparkquote/annotations/${photoId}.json`;
}

export async function saveAnnotations(photoId: string, strokes: AnnotationStroke[]): Promise<void> {
  const dir = `${FileSystem.documentDirectory}sparkquote/annotations/`;
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  const data: PhotoAnnotations = { photoId, strokes, savedAt: Date.now() };
  await FileSystem.writeAsStringAsync(annotationPath(photoId), JSON.stringify(data));
}

export async function loadAnnotations(photoId: string): Promise<AnnotationStroke[]> {
  try {
    const text = await FileSystem.readAsStringAsync(annotationPath(photoId));
    const data = JSON.parse(text) as PhotoAnnotations;
    return data.strokes ?? [];
  } catch {
    return [];
  }
}

export async function hasAnnotations(photoId: string): Promise<boolean> {
  const info = await FileSystem.getInfoAsync(annotationPath(photoId));
  return info.exists;
}

export async function deleteAnnotations(photoId: string): Promise<void> {
  await FileSystem.deleteAsync(annotationPath(photoId), { idempotent: true });
}
