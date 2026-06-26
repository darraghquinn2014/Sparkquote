/**
 * Sync manager (spec §9.1).
 *
 * Glues connectivity detection to the drain worker. When the device comes
 * online, it drains the queue through the connected provider. Pure-ish: network
 * state and the provider are injected, so the trigger logic is testable.
 *
 * Direction is outbound BACKUP only (device -> the user's vault), which keeps
 * conflict handling to last-write-wins per record, as scoped in the doc. If
 * multi-device editing is ever needed, that is the point to revisit.
 */

import type { CloudProvider } from './sync-worker';
import { drainQueue, type DrainResult } from './sync-worker';
import { queueStats, type SyncItem, type QueueStats } from './sync-queue';

export interface SyncManagerDeps {
  /** Returns the connected provider, or null if the user hasn't linked a vault. */
  getProvider: () => CloudProvider | null;
  /** Loads the current queue from the DB. */
  loadQueue: () => Promise<SyncItem[]>;
  /** Persists a single item transition. */
  saveItem: (item: SyncItem) => Promise<void>;
  /** Current time provider (injectable for tests). */
  now?: () => number;
}

export interface SyncRunOutcome {
  ran: boolean;
  reason?: 'offline' | 'no-provider' | 'empty';
  result?: DrainResult;
}

export class SyncManager {
  constructor(private readonly deps: SyncManagerDeps) {}

  private now(): number {
    return this.deps.now ? this.deps.now() : Date.now();
  }

  /** Attempt a sync run. Safe to call on every connectivity change. */
  async sync(isOnline: boolean): Promise<SyncRunOutcome> {
    if (!isOnline) return { ran: false, reason: 'offline' };

    const provider = this.deps.getProvider();
    if (!provider) return { ran: false, reason: 'no-provider' };

    const queue = await this.deps.loadQueue();
    if (queue.length === 0) return { ran: false, reason: 'empty' };

    const result = await drainQueue(provider, queue, this.now(), (item) =>
      this.deps.saveItem(item),
    );
    return { ran: true, result };
  }

  /** Current queue health for the status UI. */
  async stats(): Promise<QueueStats> {
    return queueStats(await this.deps.loadQueue());
  }
}
