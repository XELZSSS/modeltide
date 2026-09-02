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

// Module-level inflight map: CacheService is constructed per-request
// (see buildContext), so an instance field cannot dedupe concurrent
// requests. A shared map merges thundering-herd refreshes within one isolate.
const globalInflight = new Map<string, Promise<unknown>>();

export class CacheService {
  constructor(
    private kv: KVNamespace | undefined,
    private version: string,
  ) {}

  private vk(k: string): string {
    return `${this.version}:${k}`;
  }

  private async get<T>(k: string): Promise<T | undefined> {
    if (!this.kv) return undefined;
    // NOTE: edge cacheTtl=30s may serve a pre-refresh envelope for up to 30s
    // after a refresh, effectively extending the soft TTL by 30s. Acceptable
    // for dashboard data; keeps KV reads cheap.
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
    const expirationTtl = Math.min(Math.max(Math.ceil((ttl + STALE_WINDOW_MS) / 1000), 60), 2592000);
    await this.kv.put(k, JSON.stringify(envelope), { expirationTtl });
  }

  async setSafe<T>(k: string, v: T, ttl: number): Promise<void> {
    if (!this.kv) return;
    if (!Number.isFinite(ttl) || ttl <= 0) return;
    await this.set(this.vk(k), v, ttl);
  }

  async withTtl<T>(k: string, ttl: number, fn: () => Promise<{ data: T; ttl?: number }>): Promise<T> {
    // No KV: still dedupe concurrent upstream fetches via the shared inflight
    // map (in-process singleflight) instead of fanning out per request.
    if (!this.kv) {
      return this.refresh(this.vk(k), ttl, fn);
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
    // (shared map — see globalInflight above, not per-request state).
    const existing = globalInflight.get(vk) as Promise<T> | undefined;
    if (existing) return existing;
    const p = (async () => {
      const { data, ttl: t } = await fn();
      await this.set(vk, data, t ?? ttl);
      return data;
    })();
    globalInflight.set(vk, p);
    try {
      return await p;
    } finally {
      globalInflight.delete(vk);
    }
  }
}
