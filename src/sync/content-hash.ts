/**
 * Content hash (spec §9.1 idempotency).
 *
 * A small, deterministic, dependency-free hash (FNV-1a 32-bit, hex) used as the
 * idempotency key for sync items. We only need stable change-detection — "did
 * this entity's serialized content change?" — not cryptographic strength, so a
 * fast non-crypto hash is the right tool and avoids a native crypto dependency.
 */

export function contentHash(input: string): string {
  let h = 0x811c9dc5; // FNV offset basis
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    // 32-bit FNV prime multiply via shifts to stay in integer range
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** Hash an entity payload object by stable JSON serialization. */
export function hashPayload(payload: unknown): string {
  return contentHash(stableStringify(payload));
}

/** JSON.stringify with sorted keys so equal objects hash equally. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
}
