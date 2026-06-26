import { describe, it, expect } from 'vitest';
import {
  createPhoto, photosForProject, photosForLine, toPhoto, photoToRaw,
} from '../photo-service';
import { QUALITY_SPECS, originalPhotoPath, projectMediaDir } from '../media-types';
import type { MediaPaths, Photo } from '../media-types';
import { toClientEstimate } from '../../pdf/client-view-model';
import { renderEstimateHtml } from '../../pdf/render-html';
import { priceEstimate } from '../../domain/pricing';
import type { Estimate } from '../../domain/types';

const paths: MediaPaths = { documentDir: 'file:///app/Documents/', cacheDir: 'file:///app/Caches/' };

describe('quality specs', () => {
  it('lower quality means smaller dimensions and more compression', () => {
    expect(QUALITY_SPECS.low.maxEdgePx).toBeLessThan(QUALITY_SPECS.high.maxEdgePx);
    expect(QUALITY_SPECS.low.compress).toBeLessThan(QUALITY_SPECS.high.compress);
  });
});

describe('paths', () => {
  it('originals live under the document dir in a project folder', () => {
    const p = originalPhotoPath(paths, 'proj1', 'photo1');
    expect(p).toContain('Documents/projects/proj1/photos/photo1.jpg');
  });
  it('sanitises unsafe id characters in paths', () => {
    const p = projectMediaDir(paths, '../evil id');
    expect(p).not.toContain('..');
    expect(p).toContain('Documents/projects/_evil_id/photos');
  });
});

describe('createPhoto', () => {
  it('always creates an internal photo, never client-visible', () => {
    const { photo } = createPhoto({ paths, projectId: 'p1', quality: 'medium' });
    expect(photo.visibility).toBe('internal');
  });

  it('returns a destination path under the project folder', () => {
    const { photo, destPath } = createPhoto({ paths, projectId: 'p1', quality: 'high' });
    expect(destPath).toContain('Documents/projects/p1/photos/');
    expect(destPath).toBe(photo.filePath);
  });

  it('attaches to a line item when given', () => {
    const { photo } = createPhoto({ paths, projectId: 'p1', lineItemId: 'l9', quality: 'low' });
    expect(photo.lineItemId).toBe('l9');
  });
});

describe('grouping', () => {
  const photos: Photo[] = [
    { id: 'a', projectId: 'p1', filePath: 'x', quality: 'low', visibility: 'internal', capturedAt: 100 },
    { id: 'b', projectId: 'p1', lineItemId: 'l1', filePath: 'y', quality: 'low', visibility: 'internal', capturedAt: 200 },
    { id: 'c', projectId: 'p2', filePath: 'z', quality: 'low', visibility: 'internal', capturedAt: 150 },
  ];
  it('returns project photos newest first', () => {
    expect(photosForProject(photos, 'p1').map((p) => p.id)).toEqual(['b', 'a']);
  });
  it('filters by line item', () => {
    expect(photosForLine(photos, 'l1').map((p) => p.id)).toEqual(['b']);
  });
});

describe('row mapping', () => {
  it('round-trips a photo, forcing internal visibility even if a row says otherwise', () => {
    const raw = { id: 'a', project_id: 'p1', line_item_id: null, file_path: 'x', quality: 'high', visibility: 'public', captured_at: 1 };
    const photo = toPhoto(raw);
    expect(photo.visibility).toBe('internal'); // tampered row is ignored
    const back = photoToRaw(photo);
    expect(back.visibility).toBe('internal');
  });
  it('falls back to medium for an unknown quality', () => {
    const photo = toPhoto({ id: 'a', project_id: 'p1', file_path: 'x', quality: 'ultra', visibility: 'internal', captured_at: 1 });
    expect(photo.quality).toBe('medium');
  });
});

describe('STRUCTURAL guarantee: photos cannot reach the client PDF', () => {
  it('client view-model + HTML never reference photo paths', () => {
    const est: Estimate = {
      id: 'e1', mode: 'quick', status: 'draft', currency: 'GBP', hourlyRateMinor: 5000,
      vatRatePct: 20, appliedLaborToggleIds: [],
      lineItems: [{ id: 'l1', description: 'Socket', resolvedMaterialCostMinor: 410, laborBaseHours: 0.4, quantity: 1, appliedLaborToggleIds: [] }],
    };
    const client = toClientEstimate(est, priceEstimate(est, []));
    const html = renderEstimateHtml(client);
    // there is no photo data in the client model at all; the HTML can't show one
    expect(JSON.stringify(client)).not.toContain('photos');
    expect(html).not.toContain('Documents/projects');
    expect(html).not.toContain('.jpg');
  });
});
