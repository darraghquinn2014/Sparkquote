/**
 * Sync provider adapter + drain worker (spec §9.2).
 *
 * The user authenticates THEIR OWN cloud (Drive/OneDrive/Dropbox) and the app
 * writes to an app-scoped folder. All three sit behind one CloudProvider
 * interface, so adding a provider later is one adapter, not a rewrite. The drain
 * worker is provider-agnostic and pure-ish (its only effects go through the
 * injected provider + a persistence callback), so it is fully unit-testable
 * with a fake provider.
 */

import {
  type SyncItem,
  dueItems,
  markDone,
  markFailed,
} from './sync-queue';

/** Minimal contract every cloud backend implements. */
export interface CloudProvider {
  readonly name: string;
  /** Upload (or overwrite) a JSON payload at an app-scoped logical path. */
  putJson(path: string, json: string): Promise<void>;
  /** Upload (or overwrite) a binary file. */
  putFile(path: string, localFilePath: string): Promise<void>;
  /** Delete a remote object. Missing object is treated as success (idempotent). */
  remove(path: string): Promise<void>;
}

/** Map a queue item to its stable remote path within the app-scoped folder. */
export function remotePathFor(item: SyncItem): string {
  switch (item.entityType) {
    case 'estimate': return `estimates/${item.entityId}.json`;
    case 'project': return `projects/${item.entityId}.json`;
    case 'photo': return `photos/${item.entityId}.jpg`;
    default: {
      const _exhaustive: never = item.entityType;
      throw new Error(`Unknown entity type: ${_exhaustive}`);
    }
  }
}

/** Upload one item through the provider. Throws on failure (caller handles retry). */
export async function uploadItem(provider: CloudProvider, item: SyncItem): Promise<void> {
  const path = remotePathFor(item);
  if (item.operation === 'delete') {
    await provider.remove(path);
    return;
  }
  if (item.entityType === 'photo') {
    if (!item.filePath) throw new Error(`Photo sync item ${item.id} has no filePath`);
    await provider.putFile(path, item.filePath);
    return;
  }
  if (!item.payloadJson) throw new Error(`Data sync item ${item.id} has no payload`);
  await provider.putJson(path, item.payloadJson);
}

export interface DrainResult {
  queue: SyncItem[];
  uploaded: number;
  failed: number;
}

/**
 * Drain due items through the provider. Each item is uploaded; success marks it
 * done, failure schedules a backoff retry. Items already done are skipped, so a
 * re-run after an interrupted drain resumes without duplicating work (the
 * idempotency guarantee). Persistence of each transition is delegated to the
 * onItemChange callback (writes to the DB in the app).
 */
export async function drainQueue(
  provider: CloudProvider,
  queue: SyncItem[],
  now: number,
  onItemChange?: (item: SyncItem) => Promise<void> | void,
): Promise<DrainResult> {
  const due = dueItems(queue, now);
  let uploaded = 0;
  let failed = 0;

  // index for in-place replacement in the returned queue
  const byId = new Map(queue.map((i) => [i.id, i]));

  for (const item of due) {
    try {
      await uploadItem(provider, item);
      const done = markDone(item, now);
      byId.set(item.id, done);
      uploaded += 1;
      await onItemChange?.(done);
    } catch {
      const failedItem = markFailed(item, now);
      byId.set(item.id, failedItem);
      failed += 1;
      await onItemChange?.(failedItem);
    }
  }

  return { queue: Array.from(byId.values()), uploaded, failed };
}
