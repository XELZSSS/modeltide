import { utf8ByteLength, fnv1aHash } from "@/shared/utils";
import { UpstreamError } from "@/server/infra/errors";
import { isEnvelope, maxStaleMs, type StaleEnvelope } from "@/server/infra/cache/envelope";
import { L1_MAX_TTL_MS, MAX_KV_RETENTION_TTL_S } from "@/server/config";
import { MemoryL1 } from "@/server/infra/cache/memory-l1";

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
  const h1 = (parseInt(fnv1aHash(vk), 36) % 50) / 1000;
  const h2 = (parseInt(fnv1aHash(`${vk}:salt`), 36) % 50) / 1000;
  const factor = 0.95 + h1 + h2;
  if (ttl < 60_000) return Math.max(1000, Math.round(ttl * factor));
  return Math.max(60_000, Math.round(ttl * factor));
}

function l1TtlFor(effective: number): number {
  if (!Number.isFinite(effective) || effective <= 0) return L1_MAX_TTL_MS;
  const scaled = Math.floor(effective / 10);
  return Math.min(effective, Math.max(L1_MAX_TTL_MS, Math.min(15 * 60_000, scaled)));
}

const sharedL1 = new MemoryL1();
const sharedInflight = new InflightRegistry();

const FAILURE_COOLDOWN_MS = 45_000;
const FAILURE_COOLDOWN_MAX_KEYS = 512;

// A persistently failing KV read is otherwise indistinguishable from an empty
// store; throttle so a full outage logs once per interval instead of per hit.
const KV_READ_WARN_THROTTLE_MS = 5 * 60_000;
let lastKvReadWarnAt = 0;

function warnKvReadFailure(err: unknown): void {
  const now = Date.now();
  if (now - lastKvReadWarnAt < KV_READ_WARN_THROTTLE_MS) return;
  lastKvReadWarnAt = now;
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

  /** Whether the recorded failure for key was timeout-caused (for 504 fidelity). */
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
  lastKvReadWarnAt = 0;
}

export interface CacheStores {
  l1?: MemoryL1;
  inflight?: InflightRegistry;
  failureCooldownMs?: number;
}

/**
 * Two-tier cache (memory L1 + KV L2) with per-key TTL envelopes.
 *
 * Version policy is a hard cut: every key is prefixed with the active
 * CACHE_VERSION, and a version bump is an ABI break — entries under an old
 * prefix are never read, rewritten, or migrated; they just expire unused
 * (≤30d KV retention). The read path stays single-generation (exactly one
 * candidate key per lookup), and payload-shape changes are safe by
 * construction: no legacy-read or adoption machinery exists, by design.
 */
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
      // KV read failure should degrade to a refresh/stale path, not bubble a 502.
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

  /** Persist under the current key; write errors are logged, never fail the request. */
  private async storeCurrent<T>(vk: string, data: T, ttl: number): Promise<void> {
    const hasKv = this.kv != null;
    const requested = ttl;
    const effective = jitteredTtl(vk, Number.isFinite(requested) && requested > 0 ? requested : ttl);
    try {
      const serialized = JSON.stringify({ d: data, e: Date.now() + effective, t: effective });
      const bytes = utf8ByteLength(serialized);
      this.l1.set(vk, data, hasKv ? l1TtlFor(effective) : effective, bytes);
      await this.setSerialized(vk, serialized, effective);
    } catch (err) {
      // KV write failures (quota, 413 too-large, transient) degrade this key
      // to memory-only caching. Log so sustained write pressure — e.g. the
      // free-plan 1000 writes/day cap — is observable in worker logs.
      console.warn(`[cache] KV write failed for ${vk}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async withTtl<T>(k: string, ttl: number, fn: () => Promise<{ data: T; ttl?: number }>): Promise<T> {
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
        // Memory-only mode still honors the stale budget so an isolate never
        // serves arbitrarily old data (mirrors the KV stale path below).
        if (Date.now() - mem.e > maxStaleMs(ttl)) throw err;
        return mem.d;
      }
    }
    const hit = await this.getVersioned<T>(k);
    if (!hit) {
      try {
        return await this.refresh(vk, ttl, fn);
      } catch (err) {
        // KV read failed (getVersioned swallows) or upstream down: serve the
        // bounded stale L1 copy when one exists instead of failing the request.
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

  private async refresh<T>(vk: string, ttl: number, fn: () => Promise<{ data: T; ttl?: number }>): Promise<T> {
    const existing = this.inflight.get<T>(vk);
    if (existing) return existing;
    if (refreshFailureCooldown.shouldSkip(vk, this.failureCooldownMs)) {
      // Preserve the original failure class so a timed-out upstream keeps
      // surfacing 504 (not 502) while the cooldown is armed.
      const timeout = refreshFailureCooldown.wasTimeout(vk);
      throw new UpstreamError(`Upstream refresh skipped (failure cooldown) for ${vk}`, { timeout });
    }
    const p = this.inflight.run(
      vk,
      (async () => {
        const { data, ttl: t } = await fn();
        await this.storeCurrent(vk, data, t ?? ttl);
        return data;
      })(),
    );
    try {
      return await p;
    } catch (err) {
      refreshFailureCooldown.record(vk, err);
      throw err;
    } finally {
      this.inflight.release(vk, p);
    }
  }
}
