import { utf8ByteLength, fnv1aHash } from "@/shared/utils";
import { ClientAbortError, UpstreamError } from "@/server/infra/errors";
import { INFLIGHT_HANG_GUARD_MS, MAX_KV_RETENTION_TTL_S } from "@/server/config";
import { isEnvelope, maxStaleMs, type StaleEnvelope } from "./envelope";
import { l1TtlFor, sharedL1, type MemoryL1 } from "./memory-l1";
import { sharedInflight, type InflightRegistry } from "./inflight";
import { FAILURE_COOLDOWN_MS, refreshFailureCooldown } from "./cooldown";

function jitteredTtl(vk: string, ttl: number): number {
  const base = Number.isFinite(ttl) && ttl > 0 ? ttl : 60_000;
  // Deterministic jitter (no Math.random) so the :00/:30 herd is still broken.
  const h1 = (parseInt(fnv1aHash(vk), 36) % 50) / 1000;
  const factor = 0.95 + h1;
  if (base < 60_000) return Math.max(1000, Math.round(base * factor));
  return Math.max(60_000, Math.round(base * factor));
}

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

interface CacheStores {
  l1?: MemoryL1;
  inflight?: InflightRegistry;
  failureCooldownMs?: number;
  /**
   * The requesting client's liveness. Held per instance (a fresh CacheService
   * is built per request) and used only to detach this caller; it never
   * cancels the shared refresh.
   */
  callerSignal?: AbortSignal;
  /** Keeps an orphaned refresh alive past the request that started it. */
  onDetach?: (work: Promise<unknown>) => void;
}

export class CacheService {
  private l1: MemoryL1;
  private inflight: InflightRegistry;
  private failureCooldownMs: number;
  private callerSignal?: AbortSignal;
  private onDetach?: (work: Promise<unknown>) => void;

  constructor(
    private kv: KVNamespace | undefined,
    private version: string,
    stores?: CacheStores,
  ) {
    this.l1 = stores?.l1 ?? sharedL1;
    this.inflight = stores?.inflight ?? sharedInflight;
    this.failureCooldownMs = stores?.failureCooldownMs ?? FAILURE_COOLDOWN_MS;
    this.callerSignal = stores?.callerSignal;
    this.onDetach = stores?.onDetach;
  }

  private vk(k: string): string {
    return `${this.version}:${k}`;
  }

  private async getRaw(kv: KVNamespace, key: string): Promise<{ raw: string } | undefined> {
    let raw: string | null;
    try {
      raw = await kv.get(key, { type: "text" });
    } catch (err) {
      warnKvReadFailure(err);
      return undefined;
    }
    if (!raw) return undefined;
    return { raw };
  }

  private async getVersioned<T>(
    kv: KVNamespace,
    k: string,
  ): Promise<{ env: StaleEnvelope<T>; bytes: number } | undefined> {
    const hit = await this.getRaw(kv, this.vk(k));
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

  private async setSerialized(kv: KVNamespace, k: string, serialized: string, ttl: number): Promise<void> {
    const expirationTtl = Math.min(Math.max(Math.ceil((ttl + maxStaleMs(ttl)) / 1000), 60), MAX_KV_RETENTION_TTL_S);
    await kv.put(k, serialized, { expirationTtl });
  }

  private async storeCurrent<T>(kv: KVNamespace | undefined, vk: string, data: T, ttl: number): Promise<void> {
    const effective = jitteredTtl(vk, ttl);
    let serialized: string;
    try {
      serialized = JSON.stringify({ d: data, e: Date.now() + effective, t: effective });
    } catch (err) {
      console.warn(`[cache] serialize failed for ${vk}: ${err instanceof Error ? err.message : String(err)}`);
      return;
    }
    // Only the KV put can be handed off: the cron has no detach hook, so it
    // awaits and cannot lose the write. Without KV the L1 is authoritative.
    this.l1.set(vk, data, kv ? l1TtlFor(effective) : effective, utf8ByteLength(serialized));
    if (!kv) return;
    const put = this.setSerialized(kv, vk, serialized, effective).catch((err: unknown) => {
      console.warn(`[cache] KV write failed for ${vk}: ${err instanceof Error ? err.message : String(err)}`);
    });
    if (this.onDetach) this.onDetach(put);
    else await put;
  }

  private async loadStaleOrRefresh<T>(
    vk: string,
    ttl: number,
    fn: () => Promise<{ data: T; ttl?: number }>,
    mem: { d: T; e: number } | undefined,
    kvHit: { env: StaleEnvelope<T> } | undefined,
    kv: KVNamespace | undefined,
  ): Promise<T> {
    try {
      return await this.refresh(vk, ttl, fn, kv);
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

  /**
   * Detach the caller from the shared refresh: an abort rejects only THIS caller
   * (mapped to 499) while the work keeps running and still populates the cache.
   * The race must live here, not inside `refresh` — whose `finally` would then
   * release the inflight slot and clear the hang guard while the shared promise
   * is still pending.
   */
  async withTtl<T>(
    k: string,
    ttl: number,
    fn: () => Promise<{ data: T; ttl?: number }>,
    opts?: { memoryOnly?: boolean },
  ): Promise<T> {
    const signal = this.callerSignal;
    if (!signal) return this.withTtlInner(k, ttl, fn, opts);
    if (signal.aborted) throw new ClientAbortError(`Client aborted request for ${k}`);
    const work = this.withTtlInner(k, ttl, fn, opts);
    return new Promise<T>((resolve, reject) => {
      let settled = false;
      const onAbort = (): void => {
        if (settled) return;
        settled = true;
        signal.removeEventListener("abort", onAbort);
        this.onDetach?.(work.then(undefined, () => {}));
        reject(new ClientAbortError(`Client aborted request for ${k}`));
      };
      signal.addEventListener("abort", onAbort, { once: true });
      // Both settle paths handled: detached work can't become an unhandled rejection.
      work.then(
        (value) => {
          if (settled) return;
          settled = true;
          signal.removeEventListener("abort", onAbort);
          resolve(value);
        },
        (err: unknown) => {
          if (settled) return;
          settled = true;
          signal.removeEventListener("abort", onAbort);
          reject(err);
        },
      );
    });
  }

  private async withTtlInner<T>(
    k: string,
    ttl: number,
    fn: () => Promise<{ data: T; ttl?: number }>,
    opts?: { memoryOnly?: boolean },
  ): Promise<T> {
    // `memoryOnly` is just "no KV for this call": one store variable drives both
    // the KV path and the memory-only path below.
    const kv = opts?.memoryOnly === true ? undefined : this.kv;
    const vk = this.vk(k);
    const mem = this.l1.get<T>(vk);
    if (mem && mem.e > Date.now()) {
      return mem.d;
    }
    if (!kv) {
      if (!mem) return this.refresh(vk, ttl, fn, kv);
      return this.loadStaleOrRefresh(vk, ttl, fn, mem, undefined, kv);
    }
    const hit = await this.getVersioned<T>(kv, k);
    if (!hit) {
      if (!mem) return this.refresh(vk, ttl, fn, kv);
      return this.loadStaleOrRefresh(vk, ttl, fn, mem, undefined, kv);
    }
    if (hit.env.e > Date.now()) {
      this.l1.set(vk, hit.env.d, l1TtlFor(hit.env.e - Date.now()), hit.bytes);
      return hit.env.d;
    }
    return this.loadStaleOrRefresh(vk, ttl, fn, mem, hit, kv);
  }

  private async refresh<T>(
    vk: string,
    ttl: number,
    fn: () => Promise<{ data: T; ttl?: number }>,
    kv: KVNamespace | undefined,
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
      await this.storeCurrent(kv, vk, data, t ?? ttl);
      return data;
    })();
    let rejectGuard: (err: unknown) => void = () => {};
    const guardRejection = new Promise<never>((_, reject) => {
      rejectGuard = reject;
    });
    // The guarded promise is what joins the registry, so callers that attach to
    // an in-flight refresh inherit the same deadline as the one that started it.
    p = this.inflight.run(vk, Promise.race([task, guardRejection]));
    p.then(undefined, () => {});
    const hangTimer = setTimeout(() => {
      this.inflight.release(vk, p);
      rejectGuard(new UpstreamError(`Upstream refresh timed out (inflight guard) for ${vk}`, { timeout: true }));
    }, INFLIGHT_HANG_GUARD_MS);
    try {
      return await p;
    } catch (err) {
      // A caller abort isn't an upstream failure; recording it cools down the key.
      if (!(err instanceof ClientAbortError)) refreshFailureCooldown.record(vk, err);
      throw err;
    } finally {
      clearTimeout(hangTimer);
      this.inflight.release(vk, p);
    }
  }
}
