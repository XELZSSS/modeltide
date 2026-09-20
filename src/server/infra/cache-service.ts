import { utf8ByteLength, fnv1aHash } from "@/shared/utils";
import { UpstreamError } from "@/server/infra/errors";
import { ONE_DAY } from "@/shared/config";
import { L1_MAX_TTL_MS, MAX_KV_RETENTION_TTL_S, MEMORY_CACHE_MAX_BYTES, MEMORY_CACHE_MAX_KEYS } from "@/server/config";

// ── Merged from infra/cache/envelope.ts + infra/cache/memory-l1.ts ──
// Single-file cache primitives: KV envelope (generation-locked via version
// prefix in CacheService.vk) + isolate-local L1 with stale fallback.
const STALE_WINDOW_MS = ONE_DAY;
const MAX_STALE_EXTRA_MS = 60 * 60_000;

export function maxStaleMs(ttl: number): number {
  if (!Number.isFinite(ttl) || ttl <= 0) return MAX_STALE_EXTRA_MS;
  return Math.min(2 * ttl + MAX_STALE_EXTRA_MS, STALE_WINDOW_MS);
}

export interface StaleEnvelope<T> {
  d: T;
  e: number;
  t?: number;
}

export function isEnvelope<T>(v: unknown): v is StaleEnvelope<T> {
  return typeof v === "object" && v !== null && "d" in v && "e" in v && typeof (v as StaleEnvelope<T>).e === "number";
}

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

function jitteredTtl(vk: string, ttl: number): number {
  const base = Number.isFinite(ttl) && ttl > 0 ? ttl : 60_000;
  // Deterministic hash jitter only (no Math.random): same key → same skew,
  // still breaks the global :00/:30 thundering herd across keys.
  const h1 = (parseInt(fnv1aHash(vk), 36) % 50) / 1000;
  const factor = 0.95 + h1;
  if (base < 60_000) return Math.max(1000, Math.round(base * factor));
  return Math.max(60_000, Math.round(base * factor));
}

function l1TtlFor(effective: number): number {
  if (!Number.isFinite(effective) || effective <= 0) return L1_MAX_TTL_MS;
  return Math.min(effective, 15 * 60_000);
}

const sharedL1 = new MemoryL1();
const sharedInflight = new InflightRegistry();

const FAILURE_COOLDOWN_MS = 45_000;
const FAILURE_COOLDOWN_MAX_KEYS = 512;
// Hang guard for the inflight registry: well past every upstream timeout
// (10s default, 15s litellm, one retry each) — only fires on a stuck fn().
const INFLIGHT_HANG_GUARD_MS = 60_000;

function warnKvReadFailure(err: unknown): void {
  console.warn(
    `[cache] KV read failed, degrading to refresh/stale path: ${err instanceof Error ? err.message : String(err)}`,
  );
}

class FailureCooldown {
  private lastFail = new Map<string, { at: number; timeout: boolean }>();

  constructor(private windowMs: number = FAILURE_COOLDOWN_MS) {}

  shouldSkip(key: string, windowMs?: number): boolean {
    const window = windowMs ?? this.windowMs;
    const entry = this.lastFail.get(key);
    if (entry == null) return false;
    if (Date.now() - entry.at < window) return true;
    this.lastFail.delete(key);
    return false;
  }

  /** Whether the recorded failure for key was timeout-caused. */
  wasTimeout(key: string): boolean {
    return this.lastFail.get(key)?.timeout === true;
  }

  record(key: string, err?: unknown): void {
    const now = Date.now();
    const timeout =
      (err instanceof UpstreamError && err.causedByTimeout) || (err instanceof Error && err.name === "TimeoutError");
    this.lastFail.set(key, { at: now, timeout });
    if (this.lastFail.size <= FAILURE_COOLDOWN_MAX_KEYS) return;
    for (const [k, t] of this.lastFail) {
      if (now - t.at >= this.windowMs) this.lastFail.delete(k);
    }
    while (this.lastFail.size > FAILURE_COOLDOWN_MAX_KEYS) {
      const oldest = this.lastFail.keys().next();
      if (oldest.done) break;
      this.lastFail.delete(oldest.value);
    }
  }

  clear(): void {
    this.lastFail.clear();
  }
}

const refreshFailureCooldown = new FailureCooldown();

export function resetModuleCachesForTests(): void {
  sharedL1.clear();
  sharedInflight.clear();
  refreshFailureCooldown.clear();
}

export interface CacheStores {
  l1?: MemoryL1;
  inflight?: InflightRegistry;
  failureCooldownMs?: number;
}

export class CacheService {
  private l1: MemoryL1;
  private inflight: InflightRegistry;
  private failureCooldownMs: number;

  constructor(
    private kv: KVNamespace | undefined,
    private version: string,
    stores?: CacheStores,
  ) {
    this.l1 = stores?.l1 ?? sharedL1;
    this.inflight = stores?.inflight ?? sharedInflight;
    this.failureCooldownMs = stores?.failureCooldownMs ?? FAILURE_COOLDOWN_MS;
  }

  private vk(k: string): string {
    return `${this.version}:${k}`;
  }

  private async getRaw(key: string): Promise<{ raw: string } | undefined> {
    let raw: string | null;
    try {
      raw = await this.kv!.get(key, { type: "text" });
    } catch (err) {
      warnKvReadFailure(err);
      return undefined;
    }
    if (!raw) return undefined;
    return { raw };
  }

  private async getVersioned<T>(k: string): Promise<{ env: StaleEnvelope<T>; bytes: number } | undefined> {
    if (!this.kv) return undefined;
    const hit = await this.getRaw(this.vk(k));
    if (!hit) return undefined;
    let env: StaleEnvelope<T>;
    try {
      env = JSON.parse(hit.raw) as StaleEnvelope<T>;
    } catch {
      return undefined;
    }
    if (!isEnvelope<T>(env)) return undefined;
    return { env, bytes: utf8ByteLength(hit.raw) };
  }

  private async setSerialized(k: string, serialized: string, ttl: number): Promise<void> {
    if (!this.kv) return;
    const expirationTtl = Math.min(Math.max(Math.ceil((ttl + maxStaleMs(ttl)) / 1000), 60), MAX_KV_RETENTION_TTL_S);
    await this.kv.put(k, serialized, { expirationTtl });
  }

  private async storeCurrent<T>(vk: string, data: T, ttl: number): Promise<void> {
    const hasKv = this.kv != null;
    const effective = jitteredTtl(vk, ttl);
    try {
      const serialized = JSON.stringify({ d: data, e: Date.now() + effective, t: effective });
      const bytes = utf8ByteLength(serialized);
      this.l1.set(vk, data, hasKv ? l1TtlFor(effective) : effective, bytes);
      await this.setSerialized(vk, serialized, effective);
    } catch (err) {
      console.warn(`[cache] KV write failed for ${vk}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async withTtl<T>(
    k: string,
    ttl: number,
    fn: () => Promise<{ data: T; ttl?: number }>,
    opts?: { memoryOnly?: boolean },
  ): Promise<T> {
    if (opts?.memoryOnly) return this.withMemory(k, ttl, fn);
    const vk = this.vk(k);
    const mem = this.l1.get<T>(vk);
    if (mem && mem.e > Date.now()) {
      return mem.d;
    }
    if (!this.kv) {
      if (!mem) return this.refresh(vk, ttl, fn);
      try {
        return await this.refresh(vk, ttl, fn);
      } catch (err) {
        if (Date.now() - mem.e > maxStaleMs(ttl)) throw err;
        return mem.d;
      }
    }
    const hit = await this.getVersioned<T>(k);
    if (!hit) {
      try {
        return await this.refresh(vk, ttl, fn);
      } catch (err) {
        if (mem) return mem.d;
        throw err;
      }
    }
    if (hit.env.e > Date.now()) {
      this.l1.set(vk, hit.env.d, l1TtlFor(hit.env.e - Date.now()), hit.bytes);
      return hit.env.d;
    }
    const staleAge = Date.now() - hit.env.e;
    const staleBudget = maxStaleMs(hit.env.t ?? ttl);
    try {
      return await this.refresh(vk, ttl, fn);
    } catch (err) {
      if (staleAge > staleBudget) throw err;
      return hit.env.d;
    }
  }

  private async withMemory<T>(k: string, ttl: number, fn: () => Promise<{ data: T; ttl?: number }>): Promise<T> {
    const vk = this.vk(k);
    const mem = this.l1.get<T>(vk);
    if (mem && mem.e > Date.now()) {
      return mem.d;
    }
    if (!mem) return this.refresh(vk, ttl, fn, true);
    try {
      return await this.refresh(vk, ttl, fn, true);
    } catch (err) {
      if (Date.now() - mem.e > maxStaleMs(ttl)) throw err;
      return mem.d;
    }
  }

  private async refresh<T>(
    vk: string,
    ttl: number,
    fn: () => Promise<{ data: T; ttl?: number }>,
    memoryOnly = false,
  ): Promise<T> {
    const existing = this.inflight.get<T>(vk);
    if (existing) return existing;
    if (refreshFailureCooldown.shouldSkip(vk, this.failureCooldownMs)) {
      const timeout = refreshFailureCooldown.wasTimeout(vk);
      throw new UpstreamError(`Upstream refresh skipped (failure cooldown) for ${vk}`, { timeout });
    }
    let p!: Promise<T>;
    const task = (async () => {
      const { data, ttl: t } = await fn();
      if (this.inflight.get(vk) !== p) return data;
      if (memoryOnly) {
        const effective = jitteredTtl(vk, t ?? ttl);
        const serialized = JSON.stringify({ d: data, e: Date.now() + effective, t: effective });
        this.l1.set(vk, data, effective, utf8ByteLength(serialized));
      } else {
        await this.storeCurrent(vk, data, t ?? ttl);
      }
      return data;
    })();
    p = this.inflight.run(vk, task);
    let rejectGuard: (err: unknown) => void = () => {};
    const guardRejection = new Promise<never>((_, reject) => {
      rejectGuard = reject;
    });
    p.then(undefined, () => {});
    const hangTimer = setTimeout(() => {
      this.inflight.release(vk, p);
      rejectGuard(new UpstreamError(`Upstream refresh timed out (inflight guard) for ${vk}`, { timeout: true }));
    }, INFLIGHT_HANG_GUARD_MS);
    try {
      return await Promise.race([p, guardRejection]);
    } catch (err) {
      refreshFailureCooldown.record(vk, err);
      throw err;
    } finally {
      clearTimeout(hangTimer);
      this.inflight.release(vk, p);
    }
  }
}
