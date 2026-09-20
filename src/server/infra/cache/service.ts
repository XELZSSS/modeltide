import { utf8ByteLength, fnv1aHash } from "@/shared/utils";
import { UpstreamError } from "@/server/infra/errors";
import { MAX_KV_RETENTION_TTL_S } from "@/server/config";
import { isEnvelope, maxStaleMs, type StaleEnvelope } from "./envelope";
import { l1TtlFor, sharedL1, type MemoryL1 } from "./memory-l1";
import { sharedInflight, type InflightRegistry } from "./inflight";
import { FAILURE_COOLDOWN_MS, refreshFailureCooldown } from "./cooldown";

function jitteredTtl(vk: string, ttl: number): number {
  const base = Number.isFinite(ttl) && ttl > 0 ? ttl : 60_000;
  // Deterministic hash jitter only (no Math.random): same key → same skew,
  // still breaks the global :00/:30 thundering herd across keys.
  const h1 = (parseInt(fnv1aHash(vk), 36) % 50) / 1000;
  const factor = 0.95 + h1;
  if (base < 60_000) return Math.max(1000, Math.round(base * factor));
  return Math.max(60_000, Math.round(base * factor));
}

// Hang guard for the inflight registry: well past every upstream timeout
// (10s default, 15s litellm, one retry each) — only fires on a stuck fn().
const INFLIGHT_HANG_GUARD_MS = 60_000;

function warnKvReadFailure(err: unknown): void {
  console.warn(
    `[cache] KV read failed, degrading to refresh/stale path: ${err instanceof Error ? err.message : String(err)}`,
  );
}

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

  private async loadStaleOrRefresh<T>(
    vk: string,
    ttl: number,
    fn: () => Promise<{ data: T; ttl?: number }>,
    mem: { d: T; e: number } | undefined,
    kvHit: { env: StaleEnvelope<T> } | undefined,
    memoryOnly: boolean,
  ): Promise<T> {
    try {
      return await this.refresh(vk, ttl, fn, memoryOnly);
    } catch (err) {
      if (kvHit) {
        const staleBudget = maxStaleMs(kvHit.env.t ?? ttl);
        if (Date.now() - kvHit.env.e <= staleBudget) return kvHit.env.d;
        throw err;
      }
      if (mem) {
        if (Date.now() - mem.e > maxStaleMs(ttl)) throw err;
        return mem.d;
      }
      throw err;
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
      return this.loadStaleOrRefresh(vk, ttl, fn, mem, undefined, false);
    }
    const hit = await this.getVersioned<T>(k);
    if (!hit) {
      if (!mem) return this.refresh(vk, ttl, fn);
      return this.loadStaleOrRefresh(vk, ttl, fn, mem, undefined, false);
    }
    if (hit.env.e > Date.now()) {
      this.l1.set(vk, hit.env.d, l1TtlFor(hit.env.e - Date.now()), hit.bytes);
      return hit.env.d;
    }
    return this.loadStaleOrRefresh(vk, ttl, fn, mem, hit, false);
  }

  private async withMemory<T>(k: string, ttl: number, fn: () => Promise<{ data: T; ttl?: number }>): Promise<T> {
    const vk = this.vk(k);
    const mem = this.l1.get<T>(vk);
    if (mem && mem.e > Date.now()) {
      return mem.d;
    }
    if (!mem) return this.refresh(vk, ttl, fn, true);
    return this.loadStaleOrRefresh(vk, ttl, fn, mem, undefined, true);
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
