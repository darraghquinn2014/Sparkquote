import { describe, it, expect, vi } from 'vitest';
import { SyncManager } from '../sync-manager';
import type { CloudProvider } from '../sync-worker';
import type { SyncItem } from '../sync-queue';

function provider(): CloudProvider {
  return {
    name: 'fake',
    putJson: vi.fn(async () => {}),
    putFile: vi.fn(async () => {}),
    remove: vi.fn(async () => {}),
  };
}

function item(over: Partial<SyncItem> = {}): SyncItem {
  return {
    id: 'i1', entityType: 'estimate', entityId: 'e1', operation: 'upsert',
    contentHash: 'h', payloadJson: '{}', status: 'pending',
    attempts: 0, nextAttemptAt: 0, createdAt: 0, updatedAt: 0, ...over,
  };
}

describe('SyncManager', () => {
  it('does not run when offline', async () => {
    const m = new SyncManager({ getProvider: () => provider(), loadQueue: async () => [item()], saveItem: async () => {} });
    expect(await m.sync(false)).toEqual({ ran: false, reason: 'offline' });
  });

  it('does not run without a linked provider', async () => {
    const m = new SyncManager({ getProvider: () => null, loadQueue: async () => [item()], saveItem: async () => {} });
    expect(await m.sync(true)).toEqual({ ran: false, reason: 'no-provider' });
  });

  it('does not run with an empty queue', async () => {
    const m = new SyncManager({ getProvider: () => provider(), loadQueue: async () => [], saveItem: async () => {} });
    expect(await m.sync(true)).toEqual({ ran: false, reason: 'empty' });
  });

  it('drains the queue when online with a provider', async () => {
    const saved: SyncItem[] = [];
    const m = new SyncManager({
      getProvider: () => provider(),
      loadQueue: async () => [item({ id: 'a' }), item({ id: 'b', entityId: 'e2' })],
      saveItem: async (i) => { saved.push(i); },
      now: () => 1000,
    });
    const outcome = await m.sync(true);
    expect(outcome.ran).toBe(true);
    expect(outcome.result!.uploaded).toBe(2);
    expect(saved).toHaveLength(2);
    expect(saved.every((i) => i.status === 'done')).toBe(true);
  });

  it('reports queue stats', async () => {
    const m = new SyncManager({
      getProvider: () => provider(),
      loadQueue: async () => [item({ status: 'pending' }), item({ id: 'b', status: 'done' })],
      saveItem: async () => {},
    });
    const s = await m.stats();
    expect(s.pending).toBe(1);
    expect(s.done).toBe(1);
  });
});
