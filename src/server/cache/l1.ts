import {
  L1_FALLBACK_TTL_MS,
  L1_OBJECT_BYTES_FACTOR,
  L1_RESIDENT_BYTES_FACTOR,
  L1_TTL_CAP_MS,
  MEMORY_CACHE_MAX_BYTES,
  MEMORY_CACHE_MAX_KEYS,
} from "./config";
import { maxStaleMs } from "./stale";

export interface MemoryEntry<T> {
  d: T;
  e: number;
  t: number;
  /** When the payload was produced, in epoch ms: the ETag's basis, kept here because the payload no longer carries it. */
  f: number;
  /** The serialized response body, kept only for sources a route actually returns. */
  s?: string;
}

/** Per-isolate LRU of decoded values, bounded by entry count and estimated resident bytes. */
export class MemoryL1 {
  private map = new Map<string, { entry: MemoryEntry<unknown>; bytes: number }>();
  private bytes = 0;

  get<T>(vk: string): MemoryEntry<T> | undefined {
    const item = this.map.get(vk);
    if (!item) return undefined;
    // An entry past every stale budget can never be served again (`pickFreshestStale` drops it), so it must not be
    // promoted to the MRU end: that promotion kept a dead entry resident while eviction dropped one that was live.
    if (Date.now() - item.entry.e > maxStaleMs(item.entry.t)) {
      this.delete(vk);
      return undefined;
    }
    this.map.delete(vk);
    this.map.set(vk, item);
    return item.entry as MemoryEntry<T>;
  }

  delete(vk: string): void {
    const item = this.map.get(vk);
    if (!item) return;
    this.bytes -= item.bytes;
    this.map.delete(vk);
  }

  set(
    vk: string,
    data: unknown,
    ttl: number,
    serializedBytes: number,
    effectiveTtl: number,
    producedAt: number,
    body?: string,
  ): boolean {
    const bytes = serializedBytes * (body === undefined ? L1_OBJECT_BYTES_FACTOR : L1_RESIDENT_BYTES_FACTOR);
    // Reject before evicting: an oversized replacement must not cost the caller the copy that is already resident.
    if (bytes > MEMORY_CACHE_MAX_BYTES) return false;
    this.delete(vk);
    // Reclaim entries that are already past every stale budget before evicting one that can still be served: they
    // hold resident bytes without being reachable through `usableStale`, so they are dead weight under pressure.
    if (this.bytes + bytes > MEMORY_CACHE_MAX_BYTES) this.sweepDead(Date.now());
    while (this.map.size >= MEMORY_CACHE_MAX_KEYS || this.bytes + bytes > MEMORY_CACHE_MAX_BYTES) {
      const oldest = this.map.keys().next();
      if (oldest.done) break;
      this.delete(oldest.value);
    }
    this.map.set(vk, { entry: { d: data, e: Date.now() + ttl, t: effectiveTtl, f: producedAt, s: body }, bytes });
    this.bytes += bytes;
    return true;
  }

  private sweepDead(now: number): void {
    for (const [key, item] of this.map) {
      if (now - item.entry.e > maxStaleMs(item.entry.t)) this.delete(key);
    }
  }

  clear(): void {
    this.map.clear();
    this.bytes = 0;
  }
}

export function l1TtlFor(effective: number): number {
  if (!Number.isFinite(effective) || effective <= 0) return L1_FALLBACK_TTL_MS;
  return Math.min(effective, L1_TTL_CAP_MS);
}

export const sharedL1 = new MemoryL1();
