import { describe, it, expect, vi } from 'vitest';
import { isSafeToClear, clearableTargets, clearCache, type MediaFileSystem } from '../cache';
import type { MediaPaths } from '../media-types';
import { originalPhotoPath, projectMediaDir } from '../media-types';

const paths: MediaPaths = {
  documentDir: 'file:///app/Documents/',
  cacheDir: 'file:///app/Caches/',
};

describe('isSafeToClear (the data-loss guard)', () => {
  it('allows directories inside the cache dir', () => {
    expect(isSafeToClear(paths, 'file:///app/Caches/thumbnails')).toBe(true);
    expect(isSafeToClear(paths, 'file:///app/Caches/pdf-temp')).toBe(true);
  });

  it('REFUSES anything under the document dir (original photos)', () => {
    const photoPath = originalPhotoPath(paths, 'proj1', 'photo1');
    expect(isSafeToClear(paths, photoPath)).toBe(false);
    expect(isSafeToClear(paths, projectMediaDir(paths, 'proj1'))).toBe(false);
    expect(isSafeToClear(paths, 'file:///app/Documents/anything')).toBe(false);
  });

  it('refuses paths outside both roots', () => {
    expect(isSafeToClear(paths, 'file:///etc/passwd')).toBe(false);
    expect(isSafeToClear(paths, 'file:///app/Other/stuff')).toBe(false);
  });

  it('refuses path traversal attempts', () => {
    expect(isSafeToClear(paths, 'file:///app/Caches/../Documents/photos')).toBe(false);
    expect(isSafeToClear(paths, 'file:///app/Caches/thumbnails/..')).toBe(false);
  });

  it('refuses if cache dir is nested inside the document dir (overlap defense)', () => {
    const overlap: MediaPaths = {
      documentDir: 'file:///app/Documents/',
      cacheDir: 'file:///app/Documents/Caches/', // pathological config
    };
    // a path here is inside the document dir, so it must be refused
    expect(isSafeToClear(overlap, 'file:///app/Documents/Caches/thumbnails')).toBe(false);
  });

  it('all default clearable targets are themselves safe', () => {
    for (const t of clearableTargets(paths)) {
      expect(isSafeToClear(paths, t.dir), t.dir).toBe(true);
    }
  });
});

describe('clearCache', () => {
  function mockFs(existing: Set<string>, sizes: Record<string, number> = {}): {
    fs: MediaFileSystem; deleted: string[];
  } {
    const deleted: string[] = [];
    const fs: MediaFileSystem = {
      exists: vi.fn(async (p: string) => existing.has(p)),
      sizeOf: vi.fn(async (p: string) => sizes[p] ?? 0),
      deleteDir: vi.fn(async (p: string) => { deleted.push(p); }),
    };
    return { fs, deleted };
  }

  it('clears existing cache dirs and reports bytes freed', async () => {
    const targets = clearableTargets(paths);
    const existing = new Set(targets.map((t) => t.dir));
    const sizes = Object.fromEntries(targets.map((t, i) => [t.dir, (i + 1) * 1000]));
    const { fs, deleted } = mockFs(existing, sizes);

    const result = await clearCache(fs, paths);
    expect(result.cleared.sort()).toEqual(['pdf-temp', 'sync-staging', 'thumbnails']);
    expect(result.bytesFreed).toBe(1000 + 2000 + 3000);
    expect(deleted).toHaveLength(3);
    expect(result.skipped).toHaveLength(0);
  });

  it('skips dirs that do not exist without error', async () => {
    const { fs, deleted } = mockFs(new Set()); // nothing exists
    const result = await clearCache(fs, paths);
    expect(result.cleared).toHaveLength(0);
    expect(deleted).toHaveLength(0);
  });

  it('never deletes a path under the document directory', async () => {
    const { fs, deleted } = mockFs(new Set(clearableTargets(paths).map((t) => t.dir)));
    await clearCache(fs, paths);
    for (const d of deleted) {
      expect(d.startsWith('file:///app/Documents/')).toBe(false);
    }
  });
});
