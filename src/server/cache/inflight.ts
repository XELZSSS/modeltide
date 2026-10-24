import { noteCacheStat } from "./stats";

/**
 * Single-flight registry keyed by versioned cache key: concurrent callers share one in-flight promise. The refresh
 * path registers externally-owned work through get/insert/release (hang guard, displaced-owner check); readers
 * coalesce concurrent loads through runShared with auto-release on settle.
 */
export class SingleFlight {
  private map = new Map<string, Promise<unknown>>();

  constructor(private onCoalesce?: () => void) {}

  get<T>(vk: string): Promise<T> | undefined {
    return this.map.get(vk) as Promise<T> | undefined;
  }

  insert<T>(vk: string, p: Promise<T>): Promise<T> {
    this.map.set(vk, p);
    return p;
  }

  release(vk: string, p: Promise<unknown>): void {
    if (this.map.get(vk) === p) this.map.delete(vk);
  }

  /** Returns the in-flight promise for `vk`, or starts `load` as the shared one. */
  runShared<T>(vk: string, load: () => Promise<T>): Promise<T> {
    const pending = this.get<T>(vk);
    if (pending) {
      this.onCoalesce?.();
      return pending;
    }
    const settled = load().finally(() => this.release(vk, settled));
    return this.insert(vk, settled);
  }

  clear(): void {
    this.map.clear();
  }
}

export const sharedInflight = new SingleFlight();

/**
 * Concurrent reads of one versioned key share a single KV round trip. The refresh path was already single-flighted;
 * the read path was not, so a burst on a cold key issued one KV read per request.
 */
export const sharedReads = new SingleFlight(() => noteCacheStat("kvReadsCoalesced"));
