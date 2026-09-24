import { L1_MAX_TTL_MS, L1_TTL_CAP_MS, MEMORY_CACHE_MAX_BYTES, MEMORY_CACHE_MAX_KEYS } from "@/server/config";
import { L1_RESIDENT_BYTES_FACTOR } from "@/server/config/cache";
import { HIGH_CARDINALITY_KEY_MARKER } from "@/server/config/keys";

interface MemoryEntry<T> {
  d: T;
  e: number;
  t: number;
}

const CAPPED_FAMILY_MAX_KEYS = Math.floor(MEMORY_CACHE_MAX_KEYS / 4);
const CAPPED_FAMILY_MAX_BYTES = MEMORY_CACHE_MAX_BYTES / 4;

export class MemoryL1 {
  private map = new Map<string, { entry: MemoryEntry<unknown>; bytes: number }>();
  private bytes = 0;

  get<T>(vk: string): MemoryEntry<T> | undefined {
    const item = this.map.get(vk);
    if (!item) return undefined;
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

  set(vk: string, data: unknown, ttl: number, serializedBytes: number, effectiveTtl = ttl): void {
    this.delete(vk);
    const bytes = serializedBytes * L1_RESIDENT_BYTES_FACTOR;
    if (bytes > MEMORY_CACHE_MAX_BYTES) return;
    if (vk.includes(HIGH_CARDINALITY_KEY_MARKER)) this.evictFromCappedFamily(bytes);
    if (this.map.size >= MEMORY_CACHE_MAX_KEYS) {
      const now = Date.now();
      for (const [k, item] of this.map) {
        if (item.entry.e <= now) this.delete(k);
        if (this.map.size < MEMORY_CACHE_MAX_KEYS) break;
      }
      if (this.map.size >= MEMORY_CACHE_MAX_KEYS) {
        const oldest = this.map.keys().next();
        if (!oldest.done) this.delete(oldest.value);
      }
    }
    while (this.bytes + bytes > MEMORY_CACHE_MAX_BYTES) {
      const oldest = this.map.keys().next();
      if (!oldest.done) this.delete(oldest.value);
      else break;
    }
    this.map.set(vk, { entry: { d: data, e: Date.now() + ttl, t: effectiveTtl }, bytes });
    this.bytes += bytes;
  }

  clear(): void {
    this.map.clear();
    this.bytes = 0;
  }

  private evictFromCappedFamily(bytes: number): void {
    let keys = 0;
    let familyBytes = 0;
    for (const [k, item] of this.map) {
      if (!k.includes(HIGH_CARDINALITY_KEY_MARKER)) continue;
      keys += 1;
      familyBytes += item.bytes;
    }
    for (const [k, item] of this.map) {
      if (keys < CAPPED_FAMILY_MAX_KEYS && familyBytes + bytes <= CAPPED_FAMILY_MAX_BYTES) return;
      if (!k.includes(HIGH_CARDINALITY_KEY_MARKER)) continue;
      keys -= 1;
      familyBytes -= item.bytes;
      this.delete(k);
    }
  }
}

export function l1TtlFor(effective: number): number {
  if (!Number.isFinite(effective) || effective <= 0) return L1_MAX_TTL_MS;
  return Math.min(effective, L1_TTL_CAP_MS);
}

export const sharedL1 = new MemoryL1();
