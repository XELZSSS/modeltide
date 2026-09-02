import { ONE_DAY } from "@/shared/config";

/**
 * KV entries get a hard expirationTtl of ttl + STALE_WINDOW_MS and carry a soft
 * expiry timestamp inside the payload. A soft-expired entry is refreshed on read;
 * if the upstream refresh fails, the stale payload is served instead of failing
 * (mirrors the CDN stale-if-error=ONE_DAY policy in routes/registry.ts).
 */
const STALE_WINDOW_MS = ONE_DAY;

interface StaleEnvelope<T> {
  d: T;
  e: number;
}

function isEnvelope<T>(v: unknown): v is StaleEnvelope<T> {
  return typeof v === "object" && v !== null && "d" in v && "e" in v && typeof (v as StaleEnvelope<T>).e === "number";
}

export class CacheService {
  private inflight = new Map<string, Promise<unknown>>();
  constructor(
    private kv: KVNamespace | undefined,
    private version: string,
  ) {}

  private vk(k: string): string {
    return `${this.version}:${k}`;
  }

  private async get<T>(k: string): Promise<T | undefined> {
    if (!this.kv) return undefined;
    const raw = await this.kv.get(k, { type: "text", cacheTtl: 30 });
    if (!raw) return undefined;
    try {
      return JSON.parse(raw) as T;
    } catch {
      // Corrupted entry (truncated write, version residue): treat as miss so the
      // key can self-heal on the next refresh instead of failing every request.
      return undefined;
    }
  }

  private async set<T>(k: string, v: T, ttl: number): Promise<void> {
    if (!this.kv) return;
    const envelope: StaleEnvelope<T> = { d: v, e: Date.now() + ttl };
    await this.kv.put(k, JSON.stringify(envelope), { expirationTtl: Math.ceil((ttl + STALE_WINDOW_MS) / 1000) });
  }

  async setSafe<T>(k: string, v: T, ttl: number): Promise<void> {
    if (!this.kv) return;
    await this.set(this.vk(k), v, ttl);
  }

  async withTtl<T>(k: string, ttl: number, fn: () => Promise<{ data: T; ttl?: number }>): Promise<T> {
    // No KV: bypass cache and fetch upstream directly (graceful degradation per docs)
    // Docs: https://developers.cloudflare.com/kv/concepts/kv-bindings/ — binding is optional, env.CACHE is undefined when not configured
    if (!this.kv) {
      const { data } = await fn();
      return data;
    }
    const vk = this.vk(k);
    const hit = await this.get<StaleEnvelope<T>>(vk);
    if (hit !== undefined) {
      if (!isEnvelope<T>(hit)) return hit; // legacy unwrapped entry, still within its hard TTL
      if (hit.e > Date.now()) return hit.d;
      try {
        return await this.refresh(vk, ttl, fn);
      } catch {
        return hit.d; // soft-expired but upstream failed: serve stale
      }
    }
    return this.refresh(vk, ttl, fn);
  }

  private async refresh<T>(vk: string, ttl: number, fn: () => Promise<{ data: T; ttl?: number }>): Promise<T> {
    // Dedupes concurrent refreshes of the same key within this isolate
    const existing = this.inflight.get(vk) as Promise<T> | undefined;
    if (existing) return existing;
    const p = (async () => {
      const { data, ttl: t } = await fn();
      await this.set(vk, data, t ?? ttl);
      return data;
    })();
    this.inflight.set(vk, p);
    try {
      return await p;
    } finally {
      this.inflight.delete(vk);
    }
  }

  /** Whether KV caching is enabled */
  get enabled(): boolean {
    return !!this.kv;
  }
}
