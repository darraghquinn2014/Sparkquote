/**
 * Media types & quality settings (spec §8).
 *
 * Photos are for the electrician's INTERNAL liability record — they are never
 * shown to clients (the Phase 5 view-model has no field for them). This module
 * defines the quality tiers (which trade local storage against detail) and the
 * project-folder path scheme. Pure config + path logic, unit-tested.
 */

export type ImageQuality = 'low' | 'medium' | 'high';

export type PhotoStage = 'before' | 'during' | 'after';

/** Photos are always internal — the type makes the alternative unrepresentable. */
export type PhotoVisibility = 'internal';

export interface QualitySpec {
  quality: ImageQuality;
  /** Longest-edge pixel cap applied at capture/compression time. */
  maxEdgePx: number;
  /** JPEG compression quality 0..1. */
  compress: number;
  /** Rough human label for the settings UI. */
  note: string;
}

/**
 * Quality tiers (spec §8). Lower quality = smaller local footprint, which is
 * the whole point of the slider — managing storage on a working phone that
 * accumulates hundreds of site photos.
 */
export const QUALITY_SPECS: Record<ImageQuality, QualitySpec> = {
  low: { quality: 'low', maxEdgePx: 1024, compress: 0.5, note: 'Smallest files, quick to sync' },
  medium: { quality: 'medium', maxEdgePx: 2048, compress: 0.7, note: 'Balanced detail and size' },
  high: { quality: 'high', maxEdgePx: 4096, compress: 0.9, note: 'Full detail, larger files' },
};

export interface Photo {
  id: string;
  projectId: string;
  lineItemId?: string;
  locationId?: string;
  filePath: string;
  quality: ImageQuality;
  visibility: PhotoVisibility;
  capturedAt: number;
  caption?: string;
  note?: string;
  stage?: PhotoStage;
}

/** Root of app-private storage (set by the app from FileSystem.documentDirectory). */
export interface MediaPaths {
  /** e.g. FileSystem.documentDirectory */
  documentDir: string;
  /** e.g. FileSystem.cacheDirectory */
  cacheDir: string;
}

/** Directory holding a project's ORIGINAL photos (never auto-deleted). */
export function projectMediaDir(paths: MediaPaths, projectId: string): string {
  return joinPath(paths.documentDir, `projects/${safeSegment(projectId)}/photos`);
}

/** Full path for a newly captured original photo. */
export function originalPhotoPath(paths: MediaPaths, projectId: string, photoId: string): string {
  return joinPath(projectMediaDir(paths, projectId), `${safeSegment(photoId)}.jpg`);
}

/** Directory holding a project's floor-plan images (one per floor). */
export function floorPlansDir(paths: MediaPaths, projectId: string): string {
  return joinPath(paths.documentDir, `projects/${safeSegment(projectId)}/floor-plans`);
}

/** Full path for a floor plan's stored image. */
export function floorPlanPath(paths: MediaPaths, projectId: string, floorPlanId: string): string {
  return joinPath(floorPlansDir(paths, projectId), `${safeSegment(floorPlanId)}.jpg`);
}

/** Directory holding a project's snag-list reference photos. */
export function snagPhotosDir(paths: MediaPaths, projectId: string): string {
  return joinPath(paths.documentDir, `projects/${safeSegment(projectId)}/snags`);
}

/** Full path for a snag item's stored photo. */
export function snagPhotoPath(paths: MediaPaths, projectId: string, snagId: string): string {
  return joinPath(snagPhotosDir(paths, projectId), `${safeSegment(snagId)}.jpg`);
}

/** Directory for derived thumbnails (safe to clear — regenerated on demand). */
export function thumbnailDir(paths: MediaPaths): string {
  return joinPath(paths.cacheDir, 'thumbnails');
}

/** Directory for temporary PDF render output (safe to clear). */
export function pdfTempDir(paths: MediaPaths): string {
  return joinPath(paths.cacheDir, 'pdf-temp');
}

/** Directory staging files for sync upload (safe to clear once uploaded). */
export function syncStagingDir(paths: MediaPaths): string {
  return joinPath(paths.cacheDir, 'sync-staging');
}

function joinPath(base: string, rel: string): string {
  const b = base.endsWith('/') ? base.slice(0, -1) : base;
  return `${b}/${rel}`;
}

/** Sanitise an id for safe use as a path segment. */
function safeSegment(s: string): string {
  return s.replace(/[^a-zA-Z0-9_-]+/g, '_');
}
