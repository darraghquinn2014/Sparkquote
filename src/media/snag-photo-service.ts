/**
 * Snag-item photo import service.
 *
 * Mirrors floor-plan-service.ts: resize/compress a captured or picked image
 * and move it into the project's snags folder. Snag photos don't need
 * overlay geometry, so unlike floor plans there's no width/height to report
 * back — just the stored file path.
 */
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';
import type { MediaPaths } from './media-types';
import { snagPhotosDir, snagPhotoPath } from './media-types';

const MAX_EDGE_PX = 2048;
const COMPRESS = 0.8;

/**
 * Process a captured/picked snag photo and move it into project storage.
 * The snag item's id must already exist (create the row first, then import,
 * then patch its photo_path — same id-before-file ordering as floor plans).
 */
export async function importSnagPhoto(
  sourceUri: string,
  paths: MediaPaths,
  projectId: string,
  snagId: string,
): Promise<string> {
  const processed = await ImageManipulator.manipulateAsync(
    sourceUri,
    [{ resize: { width: MAX_EDGE_PX } }],
    { compress: COMPRESS, format: ImageManipulator.SaveFormat.JPEG },
  );

  const destPath = snagPhotoPath(paths, projectId, snagId);
  await FileSystem.makeDirectoryAsync(snagPhotosDir(paths, projectId), { intermediates: true });
  await FileSystem.moveAsync({ from: processed.uri, to: destPath });

  return destPath;
}

/** Delete a snag item's stored photo file. */
export async function deleteSnagPhoto(filePath: string): Promise<void> {
  await FileSystem.deleteAsync(filePath, { idempotent: true });
}
