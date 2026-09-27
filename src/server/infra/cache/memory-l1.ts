import { L1_MAX_TTL_MS, L1_TTL_CAP_MS, MEMORY_CACHE_MAX_BYTES, MEMORY_CACHE_MAX_KEYS } from "@/server/config";
import { L1_RESIDENT_BYTES_FACTOR } from "@/server/config/cache";

interface MemoryEntry<T> {
  d: T;
  e: number;
  t: number;
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

  set(vk: string, data: unknown, ttl: number, serializedBytes: number, effectiveTtl = ttl): boolean {
    this.delete(vk);
    const bytes = serializedBytes * L1_RESIDENT_BYTES_FACTOR;
    if (bytes > MEMORY_CACHE_MAX_BYTES) return false;
    while (this.map.size >= MEMORY_CACHE_MAX_KEYS || this.bytes + bytes > MEMORY_CACHE_MAX_BYTES) {
      const oldest = this.map.keys().next();
      if (oldest.done) break;
      this.delete(oldest.value);
    }
    this.map.set(vk, { entry: { d: data, e: Date.now() + ttl, t: effectiveTtl }, bytes });
    this.bytes += bytes;
    return true;
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
