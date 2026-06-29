import * as FileSystem from 'expo-file-system/legacy';

export interface Drawing {
  id: string;
  projectId: string;
  originalName: string;
  mimeType: string;
  filePath: string;
  importedAt: number;
}

function drawingsDir(projectId: string): string {
  return `${FileSystem.documentDirectory}sparkquote/drawings/${projectId}/`;
}

export async function importDrawing(
  projectId: string,
  sourceUri: string,
  mimeType: string,
  originalName: string,
): Promise<Drawing> {
  const dir = drawingsDir(projectId);
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  const id = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  const ext = originalName.includes('.') ? originalName.split('.').pop()! : 'bin';
  const filePath = `${dir}${id}.${ext}`;
  await FileSystem.copyAsync({ from: sourceUri, to: filePath });
  const drawing: Drawing = { id, projectId, originalName, mimeType, filePath, importedAt: Date.now() };
  await FileSystem.writeAsStringAsync(`${dir}${id}.json`, JSON.stringify(drawing));
  return drawing;
}

export async function loadDrawings(projectId: string): Promise<Drawing[]> {
  const dir = drawingsDir(projectId);
  try {
    const info = await FileSystem.getInfoAsync(dir);
    if (!info.exists) return [];
    const files = await FileSystem.readDirectoryAsync(dir);
    const results = await Promise.all(
      files
        .filter((f) => f.endsWith('.json'))
        .map(async (f) => {
          try {
            const text = await FileSystem.readAsStringAsync(`${dir}${f}`);
            return JSON.parse(text) as Drawing;
          } catch {
            return null;
          }
        }),
    );
    return results
      .filter((d): d is Drawing => d !== null)
      .sort((a, b) => b.importedAt - a.importedAt);
  } catch {
    return [];
  }
}

export async function deleteDrawing(drawing: Drawing): Promise<void> {
  const dir = drawingsDir(drawing.projectId);
  await FileSystem.deleteAsync(drawing.filePath, { idempotent: true });
  await FileSystem.deleteAsync(`${dir}${drawing.id}.json`, { idempotent: true });
}
