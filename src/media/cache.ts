/**
 * Cache management (spec §8 — the build risk).
 *
 * "Clear cache" must NEVER delete a user's only copy of a site photo. A vague
 * delete here is a data-loss bug with legal consequences for the electrician
 * (these photos are their liability record). So this module draws a hard line:
 *
 *   SAFE to clear   = derived/temp files, all under the CACHE directory:
 *                     thumbnails, PDF render temp, sync staging.
 *   PROTECTED       = original photos and all data under the DOCUMENT directory.
 *
 * The classification is pure and tested. The clear operation refuses any path
 * that isn't provably inside the cache directory — fail safe, not sorry.
 */

import type { MediaPaths } from './media-types';
import { thumbnailDir, pdfTempDir, syncStagingDir } from './media-types';

export type CacheCategory = 'thumbnails' | 'pdf-temp' | 'sync-staging';

export interface ClearableTarget {
  category: CacheCategory;
  dir: string;
  label: string;
}

/** The directories the clear-cache button is allowed to empty. */
export function clearableTargets(paths: MediaPaths): ClearableTarget[] {
  return [
    { category: 'thumbnails', dir: thumbnailDir(paths), label: 'Image thumbnails' },
    { category: 'pdf-temp', dir: pdfTempDir(paths), label: 'Temporary PDF files' },
    { category: 'sync-staging', dir: syncStagingDir(paths), label: 'Sync staging files' },
  ];
}

function normalise(p: string): string {
  // collapse duplicate slashes and strip a trailing slash for comparison
  return p.replace(/\/+/g, '/').replace(/\/$/, '');
}

/**
 * Is this path provably INSIDE the cache directory (and therefore safe to
 * delete)? Anything under the document directory, or outside the cache dir, or
 * using traversal to escape it, returns false.
 */
export function isSafeToClear(paths: MediaPaths, target: string): boolean {
  const cache = normalise(paths.cacheDir);
  const doc = normalise(paths.documentDir);
  const t = normalise(target);

  // Reject path traversal outright.
  if (t.includes('/../') || t.endsWith('/..') || t.includes('..')) return false;

  // Must be within the cache dir...
  const insideCache = t === cache || t.startsWith(cache + '/');
  if (!insideCache) return false;

  // ...and must NOT be within the document dir (defensive: handles odd configs
  // where the two roots could overlap).
  const insideDoc = t === doc || t.startsWith(doc + '/');
  if (insideDoc) return false;

  return true;
}

/** A filesystem capable of listing/deleting and reporting sizes. */
export interface MediaFileSystem {
  exists(path: string): Promise<boolean>;
  sizeOf(path: string): Promise<number>;
  deleteDir(path: string): Promise<void>;
}

export interface ClearResult {
  cleared: CacheCategory[];
  bytesFreed: number;
  skipped: { dir: string; reason: string }[];
}

/**
 * Clear the cache. Each target is re-checked with isSafeToClear before any
 * deletion — belt and braces, so even a mis-built target list can't delete
 * protected data.
 */
export async function clearCache(
  fs: MediaFileSystem,
  paths: MediaPaths,
): Promise<ClearResult> {
  const result: ClearResult = { cleared: [], bytesFreed: 0, skipped: [] };

  for (const target of clearableTargets(paths)) {
    if (!isSafeToClear(paths, target.dir)) {
      result.skipped.push({ dir: target.dir, reason: 'not inside cache directory' });
      continue;
    }
    if (!(await fs.exists(target.dir))) continue;

    const size = await fs.sizeOf(target.dir);
    await fs.deleteDir(target.dir);
    result.cleared.push(target.category);
    result.bytesFreed += size;
  }

  return result;
}
