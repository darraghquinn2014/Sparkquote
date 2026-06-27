/**
 * Camera capture service (spec §8).
 *
 * Wraps expo-camera capture + expo-image-manipulator resize/compress + expo-
 * file-system move-into-project-folder. Applies the chosen quality tier at save
 * time so storage footprint is controlled. Thin and behind an interface; the
 * native calls need a device, so this is verified by typecheck + review.
 */

import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';
import type { ImageQuality, MediaPaths, Photo } from './media-types';
import { QUALITY_SPECS, projectMediaDir } from './media-types';
import { createPhoto } from './photo-service';

export interface SaveCaptureInput {
  /** Temp uri from the camera (full-resolution capture). */
  sourceUri: string;
  paths: MediaPaths;
  projectId: string;
  lineItemId?: string;
  locationId?: string;
  quality: ImageQuality;
}

/**
 * Process a captured image to the chosen quality and move it into the project's
 * photo folder. Returns the Photo record to persist.
 */
export async function saveCapture(input: SaveCaptureInput): Promise<Photo> {
  const spec = QUALITY_SPECS[input.quality];

  // Resize to the quality tier's longest-edge cap, then compress.
  const processed = await ImageManipulator.manipulateAsync(
    input.sourceUri,
    [{ resize: { width: spec.maxEdgePx } }],
    { compress: spec.compress, format: ImageManipulator.SaveFormat.JPEG },
  );

  const captureInput: Parameters<typeof createPhoto>[0] = {
    paths: input.paths,
    projectId: input.projectId,
    quality: input.quality,
  };
  if (input.lineItemId != null) captureInput.lineItemId = input.lineItemId;
  if (input.locationId != null) captureInput.locationId = input.locationId;
  const { photo, destPath } = createPhoto(captureInput);

  // Ensure the project folder exists, then move the processed file in.
  await FileSystem.makeDirectoryAsync(projectMediaDir(input.paths, input.projectId), {
    intermediates: true,
  });
  await FileSystem.moveAsync({ from: processed.uri, to: destPath });

  return photo;
}

/** Delete a single original photo (explicit, guarded user action — not cache clear). */
export async function deletePhoto(photo: Photo): Promise<void> {
  await FileSystem.deleteAsync(photo.filePath, { idempotent: true });
}
