import { L1_MAX_TTL_MS, L1_TTL_CAP_MS, MEMORY_CACHE_MAX_BYTES, MEMORY_CACHE_MAX_KEYS } from "@/server/config";

export interface MemoryEntry<T> {
  d: T;
  e: number;
}

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

  set(vk: string, data: unknown, ttl: number, bytes: number): void {
    this.delete(vk);
    if (bytes > MEMORY_CACHE_MAX_BYTES) return;
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
    this.map.set(vk, { entry: { d: data, e: Date.now() + ttl }, bytes });
    this.bytes += bytes;
  }

  clear(): void {
    this.map.clear();
    this.bytes = 0;
  }
}

export function l1TtlFor(effective: number): number {
  if (!Number.isFinite(effective) || effective <= 0) return L1_MAX_TTL_MS;
  return Math.min(effective, L1_TTL_CAP_MS);
}

export const sharedL1 = new MemoryL1();
