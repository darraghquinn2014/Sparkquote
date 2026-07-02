/**
 * Floor-plan image import service.
 *
 * Mirrors camera-service.ts's saveCapture, but for a document-picker image
 * URI instead of a camera capture: resize/compress, read the natural
 * dimensions off the manipulator result, then move into the project's
 * floor-plans folder. Floor plans need a larger long-edge cap than photos'
 * "high" tier (4096px) so traced walls stay legible when zoomed in.
 */
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';
import type { MediaPaths } from './media-types';
import { floorPlansDir, floorPlanPath } from './media-types';

const MAX_EDGE_PX = 4096;
const COMPRESS = 0.9;

export interface ImportFloorPlanResult {
  filePath: string;
  width: number;
  height: number;
}

/**
 * Process a picked floor-plan image and move it into project storage.
 * The floor plan's id must already exist (see the id-before-file ordering
 * in floor-plan-repo.ts: addFloorPlan → importFloorPlanImage → updateFloorPlanFile).
 */
export async function importFloorPlanImage(
  sourceUri: string,
  paths: MediaPaths,
  projectId: string,
  floorPlanId: string,
): Promise<ImportFloorPlanResult> {
  const processed = await ImageManipulator.manipulateAsync(
    sourceUri,
    [{ resize: { width: MAX_EDGE_PX } }],
    { compress: COMPRESS, format: ImageManipulator.SaveFormat.JPEG },
  );

  const destPath = floorPlanPath(paths, projectId, floorPlanId);
  await FileSystem.makeDirectoryAsync(floorPlansDir(paths, projectId), { intermediates: true });
  await FileSystem.moveAsync({ from: processed.uri, to: destPath });

  return { filePath: destPath, width: processed.width, height: processed.height };
}

/** Delete a floor plan's stored image file. */
export async function deleteFloorPlanImage(filePath: string): Promise<void> {
  await FileSystem.deleteAsync(filePath, { idempotent: true });
}
