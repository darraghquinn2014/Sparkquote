/**
 * Photo service (spec §8).
 *
 * Pure helpers to create and organise Photo records. Every photo is created
 * with visibility 'internal' — there is no code path to make one client-visible,
 * which is the counterpart to the Phase 5 view-model that has no field to carry
 * a photo into the client PDF. Binaries live on disk; these records hold paths.
 */

import type { ImageQuality, MediaPaths, Photo } from './media-types';
import { originalPhotoPath } from './media-types';

let counter = 0;
function newPhotoId(): string {
  counter += 1;
  return `photo_${Date.now().toString(36)}_${counter}`;
}

export interface RawPhoto {
  id: string;
  project_id: string;
  line_item_id?: string | null;
  location_id?: string | null;
  file_path: string;
  quality: string;
  visibility: string;
  captured_at: number;
}

export interface CapturePhotoInput {
  paths: MediaPaths;
  projectId: string;
  lineItemId?: string;
  locationId?: string;
  quality: ImageQuality;
  capturedAt?: number;
}

/**
 * Build a Photo record for a freshly captured image. Returns both the record
 * and the destination path the camera output should be written to. Always
 * internal — the visibility field is fixed, not a parameter.
 */
export function createPhoto(input: CapturePhotoInput): { photo: Photo; destPath: string } {
  const id = newPhotoId();
  const destPath = originalPhotoPath(input.paths, input.projectId, id);
  const photo: Photo = {
    id,
    projectId: input.projectId,
    filePath: destPath,
    quality: input.quality,
    visibility: 'internal',
    capturedAt: input.capturedAt ?? Date.now(),
  };
  if (input.lineItemId != null) photo.lineItemId = input.lineItemId;
  if (input.locationId != null) photo.locationId = input.locationId;
  return { photo, destPath };
}

/** Photos for a project, newest first. */
export function photosForProject(photos: Photo[], projectId: string): Photo[] {
  return photos
    .filter((p) => p.projectId === projectId)
    .sort((a, b) => b.capturedAt - a.capturedAt);
}

/** Photos attached to a specific line item. */
export function photosForLine(photos: Photo[], lineItemId: string): Photo[] {
  return photos.filter((p) => p.lineItemId === lineItemId).sort((a, b) => b.capturedAt - a.capturedAt);
}

// ── Row mapping ────────────────────────────────────────────────────────────

export function toPhoto(r: RawPhoto): Photo {
  const photo: Photo = {
    id: r.id,
    projectId: r.project_id,
    filePath: r.file_path,
    quality: (['low', 'medium', 'high'] as const).includes(r.quality as ImageQuality)
      ? (r.quality as ImageQuality)
      : 'medium',
    visibility: 'internal', // anything stored is internal, full stop
    capturedAt: r.captured_at,
  };
  if (r.line_item_id != null) photo.lineItemId = r.line_item_id;
  if (r.location_id != null) photo.locationId = r.location_id;
  return photo;
}

export function photoToRaw(p: Photo): RawPhoto {
  return {
    id: p.id,
    project_id: p.projectId,
    line_item_id: p.lineItemId ?? null,
    location_id: p.locationId ?? null,
    file_path: p.filePath,
    quality: p.quality,
    visibility: 'internal',
    captured_at: p.capturedAt,
  };
}
