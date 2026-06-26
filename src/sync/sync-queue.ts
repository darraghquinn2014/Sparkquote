/**
 * Sync queue core (spec §9).
 *
 * Offline-first: every change to a syncable entity is enqueued locally. When
 * connectivity appears, a worker drains the queue, uploading to the user's own
 * cloud vault. The design choices, all pure and tested here:
 *
 *  - DEDUPE by (entityType, entityId): a later change supersedes an earlier
 *    pending one for the same entity (last-write-wins, §9.1) — no point
 *    uploading a stale version then immediately overwriting it.
 *  - IDEMPOTENT by contentHash: re-running an upload that already succeeded is
 *    a no-op, so an interrupted drain resumes safely (§9.1 resilience).
 *  - BACKOFF: failed items retry with exponential backoff, capped, so a flaky
 *    connection doesn't hammer the provider.
 *
 * This is a backup queue (device -> cloud), NOT multi-device sync — which keeps
 * conflict handling tractable, exactly as the architecture doc scoped it.
 */

export type SyncEntityType = 'estimate' | 'project' | 'photo';
export type SyncOperation = 'upsert' | 'delete';
export type SyncStatus = 'pending' | 'inflight' | 'done' | 'failed';

export interface SyncItem {
  id: string;
  entityType: SyncEntityType;
  entityId: string;
  operation: SyncOperation;
  /** Idempotency key — typically a hash of the payload/file content. */
  contentHash: string;
  /** JSON payload for data entities; absent for photo binaries. */
  payloadJson?: string;
  /** File path for photo binary uploads. */
  filePath?: string;
  status: SyncStatus;
  attempts: number;
  nextAttemptAt: number;
  createdAt: number;
  updatedAt: number;
}

export interface EnqueueInput {
  entityType: SyncEntityType;
  entityId: string;
  operation: SyncOperation;
  contentHash: string;
  payloadJson?: string;
  filePath?: string;
  now?: number;
}

let counter = 0;
function newItemId(): string {
  counter += 1;
  return `sync_${Date.now().toString(36)}_${counter}`;
}

/** Backoff schedule in ms by attempt count, capped. */
const BACKOFF_MS = [0, 5_000, 30_000, 120_000, 600_000];
export const MAX_ATTEMPTS = 6;

export function backoffFor(attempts: number): number {
  const idx = Math.min(attempts, BACKOFF_MS.length - 1);
  return BACKOFF_MS[idx]!;
}

/**
 * Enqueue an operation, collapsing any existing PENDING item for the same
 * entity (last-write-wins). Returns the new queue.
 *
 * If an identical contentHash is already present and done, this is a no-op
 * (idempotent) — the caller need not check first.
 */
export function enqueue(queue: SyncItem[], input: EnqueueInput): SyncItem[] {
  const now = input.now ?? Date.now();

  // Already uploaded this exact content? Nothing to do.
  const alreadyDone = queue.some(
    (i) => i.entityType === input.entityType &&
      i.entityId === input.entityId &&
      i.contentHash === input.contentHash &&
      i.status === 'done',
  );
  if (alreadyDone) return queue;

  // Drop superseded PENDING items for the same entity (last-write-wins).
  const filtered = queue.filter(
    (i) => !(i.entityType === input.entityType && i.entityId === input.entityId && i.status === 'pending'),
  );

  const item: SyncItem = {
    id: newItemId(),
    entityType: input.entityType,
    entityId: input.entityId,
    operation: input.operation,
    contentHash: input.contentHash,
    status: 'pending',
    attempts: 0,
    nextAttemptAt: now,
    createdAt: now,
    updatedAt: now,
  };
  if (input.payloadJson != null) item.payloadJson = input.payloadJson;
  if (input.filePath != null) item.filePath = input.filePath;

  return [...filtered, item];
}

/** Items eligible to upload right now: pending and past their nextAttemptAt. */
export function dueItems(queue: SyncItem[], now: number): SyncItem[] {
  return queue
    .filter((i) => (i.status === 'pending' || i.status === 'failed') && i.nextAttemptAt <= now)
    .sort((a, b) => a.createdAt - b.createdAt);
}

/** Transition an item after a successful upload. */
export function markDone(item: SyncItem, now: number): SyncItem {
  return { ...item, status: 'done', updatedAt: now };
}

/**
 * Transition an item after a failed upload: schedule a backoff retry, or give
 * up after MAX_ATTEMPTS (status stays 'failed' but is no longer rescheduled).
 */
export function markFailed(item: SyncItem, now: number): SyncItem {
  const attempts = item.attempts + 1;
  const exhausted = attempts >= MAX_ATTEMPTS;
  return {
    ...item,
    status: 'failed',
    attempts,
    nextAttemptAt: exhausted ? Number.POSITIVE_INFINITY : now + backoffFor(attempts),
    updatedAt: now,
  };
}

/** Has this item exhausted its retries? */
export function isExhausted(item: SyncItem): boolean {
  return item.attempts >= MAX_ATTEMPTS;
}

export interface QueueStats {
  pending: number;
  inflight: number;
  done: number;
  failed: number;
  /** Failed AND out of retries — needs user attention. */
  stuck: number;
}

export function queueStats(queue: SyncItem[]): QueueStats {
  const stats: QueueStats = { pending: 0, inflight: 0, done: 0, failed: 0, stuck: 0 };
  for (const i of queue) {
    stats[i.status] += 1;
    if (i.status === 'failed' && isExhausted(i)) stats.stuck += 1;
  }
  return stats;
}
