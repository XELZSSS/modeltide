import { noteCacheStat } from "./stats";

/** Single-flight registry keyed by versioned cache key. */
export class InflightRegistry {
  private map = new Map<string, Promise<unknown>>();

  get<T>(vk: string): Promise<T> | undefined {
    return this.map.get(vk) as Promise<T> | undefined;
  }

  run<T>(vk: string, p: Promise<T>): Promise<T> {
    this.map.set(vk, p);
    return p;
  }

  release(vk: string, p: Promise<unknown>): void {
    if (this.map.get(vk) === p) this.map.delete(vk);
  }

  clear(): void {
    this.map.clear();
  }
}

export const sharedInflight = new InflightRegistry();

/**
 * Concurrent reads of one versioned key share a single KV round trip. The refresh path was already single-flighted;
 * the read path was not, so a burst on a cold key issued one KV read per request.
 */
export class ReadCoalescer {
  private map = new Map<string, Promise<unknown>>();

  run<T>(vk: string, load: () => Promise<T>): Promise<T> {
    const pending = this.map.get(vk) as Promise<T> | undefined;
    if (pending) {
      noteCacheStat("kvReadsCoalesced");
      return pending;
    }
    const settled = load().finally(() => {
      if (this.map.get(vk) === settled) this.map.delete(vk);
    });
    this.map.set(vk, settled);
    return settled;
  }

  clear(): void {
    this.map.clear();
  }
}

export const sharedReads = new ReadCoalescer();
