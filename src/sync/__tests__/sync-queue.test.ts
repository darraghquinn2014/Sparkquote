import { describe, it, expect } from 'vitest';
import {
  enqueue, dueItems, markDone, markFailed, isExhausted, queueStats,
  backoffFor, MAX_ATTEMPTS, type SyncItem,
} from '../sync-queue';
import { contentHash, hashPayload, stableStringify } from '../content-hash';

function base(over: Partial<SyncItem> = {}): SyncItem {
  return {
    id: 'i1', entityType: 'estimate', entityId: 'e1', operation: 'upsert',
    contentHash: 'aaaa', status: 'pending', attempts: 0,
    nextAttemptAt: 0, createdAt: 0, updatedAt: 0, ...over,
  };
}

describe('enqueue', () => {
  it('adds a pending item', () => {
    const q = enqueue([], { entityType: 'estimate', entityId: 'e1', operation: 'upsert', contentHash: 'h1', now: 100 });
    expect(q).toHaveLength(1);
    expect(q[0]!.status).toBe('pending');
    expect(q[0]!.nextAttemptAt).toBe(100);
  });

  it('LAST-WRITE-WINS: a new change supersedes a pending one for the same entity', () => {
    let q = enqueue([], { entityType: 'estimate', entityId: 'e1', operation: 'upsert', contentHash: 'h1', now: 1 });
    q = enqueue(q, { entityType: 'estimate', entityId: 'e1', operation: 'upsert', contentHash: 'h2', now: 2 });
    expect(q).toHaveLength(1);
    expect(q[0]!.contentHash).toBe('h2');
  });

  it('keeps separate entities separate', () => {
    let q = enqueue([], { entityType: 'estimate', entityId: 'e1', operation: 'upsert', contentHash: 'h1' });
    q = enqueue(q, { entityType: 'estimate', entityId: 'e2', operation: 'upsert', contentHash: 'h2' });
    expect(q).toHaveLength(2);
  });

  it('IDEMPOTENT: re-enqueueing identical content that is already done is a no-op', () => {
    const done = base({ status: 'done', contentHash: 'h1' });
    const q = enqueue([done], { entityType: 'estimate', entityId: 'e1', operation: 'upsert', contentHash: 'h1' });
    expect(q).toHaveLength(1);
    expect(q[0]!.status).toBe('done');
  });

  it('does NOT collapse a done item when content changed', () => {
    const done = base({ status: 'done', contentHash: 'h1' });
    const q = enqueue([done], { entityType: 'estimate', entityId: 'e1', operation: 'upsert', contentHash: 'h2' });
    expect(q).toHaveLength(2); // new pending alongside the old done
  });

  it('carries payload and file path', () => {
    const q = enqueue([], { entityType: 'photo', entityId: 'p1', operation: 'upsert', contentHash: 'h', filePath: '/x.jpg' });
    expect(q[0]!.filePath).toBe('/x.jpg');
  });
});

describe('dueItems', () => {
  it('returns pending/failed items past their nextAttemptAt, oldest first', () => {
    const q: SyncItem[] = [
      base({ id: 'a', createdAt: 2, nextAttemptAt: 0 }),
      base({ id: 'b', createdAt: 1, nextAttemptAt: 0 }),
      base({ id: 'c', status: 'done' }),
      base({ id: 'd', status: 'pending', nextAttemptAt: 9999 }),
    ];
    expect(dueItems(q, 100).map((i) => i.id)).toEqual(['b', 'a']);
  });
});

describe('backoff and retry', () => {
  it('increases backoff with attempts', () => {
    expect(backoffFor(1)).toBeLessThan(backoffFor(2));
    expect(backoffFor(2)).toBeLessThan(backoffFor(3));
  });

  it('markFailed schedules the next attempt', () => {
    const f = markFailed(base(), 1000);
    expect(f.attempts).toBe(1);
    expect(f.status).toBe('failed');
    expect(f.nextAttemptAt).toBeGreaterThan(1000);
  });

  it('gives up after MAX_ATTEMPTS and stops rescheduling', () => {
    let item = base();
    for (let i = 0; i < MAX_ATTEMPTS; i++) item = markFailed(item, 1000);
    expect(isExhausted(item)).toBe(true);
    expect(item.nextAttemptAt).toBe(Number.POSITIVE_INFINITY);
    // an exhausted item is never due again
    expect(dueItems([item], Number.MAX_SAFE_INTEGER)).toHaveLength(0);
  });

  it('markDone finalises an item', () => {
    expect(markDone(base(), 5).status).toBe('done');
  });
});

describe('queueStats', () => {
  it('counts by status and flags stuck items', () => {
    const exhausted = (() => { let i = base({ id: 'x' }); for (let n = 0; n < MAX_ATTEMPTS; n++) i = markFailed(i, 1); return i; })();
    const q = [base({ id: 'a' }), base({ id: 'b', status: 'done' }), base({ id: 'c', status: 'inflight' }), exhausted];
    const s = queueStats(q);
    expect(s.pending).toBe(1);
    expect(s.done).toBe(1);
    expect(s.inflight).toBe(1);
    expect(s.failed).toBe(1);
    expect(s.stuck).toBe(1);
  });
});

describe('content hash', () => {
  it('is deterministic', () => {
    expect(contentHash('hello')).toBe(contentHash('hello'));
  });
  it('differs for different input', () => {
    expect(contentHash('a')).not.toBe(contentHash('b'));
  });
  it('stableStringify sorts keys so equal objects hash equally', () => {
    expect(stableStringify({ b: 1, a: 2 })).toBe(stableStringify({ a: 2, b: 1 }));
    expect(hashPayload({ x: 1, y: [2, 3] })).toBe(hashPayload({ y: [2, 3], x: 1 }));
  });
  it('changes when content changes', () => {
    expect(hashPayload({ total: 100 })).not.toBe(hashPayload({ total: 101 }));
  });
});
