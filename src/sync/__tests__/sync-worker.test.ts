import { describe, it, expect, vi } from 'vitest';
import { drainQueue, uploadItem, remotePathFor, type CloudProvider } from '../sync-worker';
import { enqueue, dueItems, type SyncItem } from '../sync-queue';

function fakeProvider(overrides: Partial<CloudProvider> = {}): CloudProvider & {
  puts: string[]; files: string[]; removes: string[];
} {
  const puts: string[] = [];
  const files: string[] = [];
  const removes: string[] = [];
  return {
    name: 'fake',
    putJson: vi.fn(async (path: string) => { puts.push(path); }),
    putFile: vi.fn(async (path: string) => { files.push(path); }),
    remove: vi.fn(async (path: string) => { removes.push(path); }),
    puts, files, removes,
    ...overrides,
  };
}

function item(over: Partial<SyncItem> = {}): SyncItem {
  return {
    id: 'i1', entityType: 'estimate', entityId: 'e1', operation: 'upsert',
    contentHash: 'h', payloadJson: '{"total":100}', status: 'pending',
    attempts: 0, nextAttemptAt: 0, createdAt: 0, updatedAt: 0, ...over,
  };
}

describe('remotePathFor', () => {
  it('maps entity types to stable scoped paths', () => {
    expect(remotePathFor(item({ entityType: 'estimate', entityId: 'e9' }))).toBe('estimates/e9.json');
    expect(remotePathFor(item({ entityType: 'project', entityId: 'p9' }))).toBe('projects/p9.json');
    expect(remotePathFor(item({ entityType: 'photo', entityId: 'ph9' }))).toBe('photos/ph9.jpg');
  });
});

describe('uploadItem', () => {
  it('routes JSON entities to putJson', async () => {
    const p = fakeProvider();
    await uploadItem(p, item({ entityType: 'estimate' }));
    expect(p.puts).toEqual(['estimates/e1.json']);
  });
  it('routes photos to putFile', async () => {
    const p = fakeProvider();
    await uploadItem(p, item({ entityType: 'photo', entityId: 'ph1', filePath: '/x.jpg' }));
    expect(p.files).toEqual(['photos/ph1.jpg']);
  });
  it('routes deletes to remove', async () => {
    const p = fakeProvider();
    await uploadItem(p, item({ operation: 'delete' }));
    expect(p.removes).toEqual(['estimates/e1.json']);
  });
  it('throws if a photo item has no file path', async () => {
    const p = fakeProvider();
    const { filePath, ...noPath } = item({ entityType: 'photo' });
    await expect(uploadItem(p, noPath as SyncItem)).rejects.toThrow();
  });
});

describe('drainQueue', () => {
  it('uploads all due items and marks them done', async () => {
    const p = fakeProvider();
    const q = [item({ id: 'a', entityId: 'e1' }), item({ id: 'b', entityId: 'e2' })];
    const result = await drainQueue(p, q, 100);
    expect(result.uploaded).toBe(2);
    expect(result.failed).toBe(0);
    expect(result.queue.every((i) => i.status === 'done')).toBe(true);
  });

  it('marks failures and schedules retry without throwing', async () => {
    const p = fakeProvider({ putJson: vi.fn(async () => { throw new Error('network'); }) });
    const q = [item({ id: 'a' })];
    const result = await drainQueue(p, q, 100);
    expect(result.failed).toBe(1);
    expect(result.queue[0]!.status).toBe('failed');
    expect(result.queue[0]!.attempts).toBe(1);
  });

  it('IDEMPOTENT RESUME: re-draining skips already-done items', async () => {
    const p = fakeProvider();
    let q = [item({ id: 'a', entityId: 'e1' }), item({ id: 'b', entityId: 'e2' })];
    q = (await drainQueue(p, q, 100)).queue;
    // second drain: nothing due (all done), no new uploads
    const second = await drainQueue(p, q, 200);
    expect(second.uploaded).toBe(0);
    expect(p.puts).toHaveLength(2); // still just the original two
  });

  it('a partial failure leaves the good ones done and the bad one retryable', async () => {
    let calls = 0;
    const p = fakeProvider({
      putJson: vi.fn(async (path: string) => {
        calls += 1;
        if (path === 'estimates/bad.json') throw new Error('boom');
      }),
    });
    const q = [item({ id: 'a', entityId: 'good' }), item({ id: 'b', entityId: 'bad' })];
    const result = await drainQueue(p, q, 100);
    expect(result.uploaded).toBe(1);
    expect(result.failed).toBe(1);
    const good = result.queue.find((i) => i.entityId === 'good')!;
    const bad = result.queue.find((i) => i.entityId === 'bad')!;
    expect(good.status).toBe('done');
    expect(bad.status).toBe('failed');
    // the failed one is due again later; the done one is not
    expect(dueItems(result.queue, bad.nextAttemptAt).map((i) => i.entityId)).toEqual(['bad']);
  });

  it('persists each transition via the callback', async () => {
    const p = fakeProvider();
    const seen: string[] = [];
    await drainQueue(p, [item({ id: 'a' })], 100, (i) => { seen.push(i.status); });
    expect(seen).toEqual(['done']);
  });

  it('end-to-end: enqueue then drain', async () => {
    const p = fakeProvider();
    let q = enqueue([], { entityType: 'project', entityId: 'pr1', operation: 'upsert', contentHash: 'h', payloadJson: '{}', now: 0 });
    const result = await drainQueue(p, q, 1);
    expect(result.uploaded).toBe(1);
    expect(p.puts).toEqual(['projects/pr1.json']);
  });
});
