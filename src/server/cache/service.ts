import { ONE_MINUTE } from "@/shared/config/time";
import { raceAbort } from "@/server/util/abort";
import { ClientAbortError, errMsg } from "@/server/api/errors";
import { logger, type Logger } from "@/server/api/logger";
import { refreshFailureCooldown, FAILURE_COOLDOWN_MS, sharedInflight } from "./refresh";
import { maxStaleMs, type StaleEnvelope, l1TtlFor, sharedL1, TierStore, clearInflightReads } from "./store";
import { flushCacheStats, noteCacheStat, resetCacheStats } from "./stats";
import type { KvStore } from "./kv";
import { RefreshRunner } from "./refresh";

/**
 * A stale copy served while a detached refresh runs has to stay close to its own TTL: `maxStaleMs` allows up to 2 h
 * for a 30 min source, which would hand out very old data as a normal, non-partial response. Past this window the
 * request refreshes synchronously instead, so an upstream failure surfaces as `degraded` (partial) rather than as old
 * data pretending to be current.
 */
const SWR_STALE_EXTRA_MS = 60 * ONE_MINUTE;

/** `swr` = served while a detached refresh runs; `fallback` = the refresh already failed and this is the last resort. */
type StaleBudget = "swr" | "fallback";

export function resetModuleCachesForTests(): void {
  sharedL1.clear();
  sharedInflight.clear();
  refreshFailureCooldown.clear();
  clearInflightReads();
  resetCacheStats();
}

interface CacheOptions {
  callerSignal?: AbortSignal;
  onDetach?: (work: Promise<unknown>) => void;
  log?: Logger;
}

export interface CacheResult<T> {
  value: T;
  degraded: boolean;
}

export class CacheService {
  private tier: TierStore;
  private refreshRunner: RefreshRunner;
  private callerSignal?: AbortSignal;
  private onDetach?: (work: Promise<unknown>) => void;
  private log: Logger;

  constructor(
    private kv: KvStore | undefined,
    version: string,
    opts?: CacheOptions,
  ) {
    this.tier = new TierStore(version, sharedL1, opts?.onDetach, opts?.log);
    this.refreshRunner = new RefreshRunner(this.tier, sharedInflight, FAILURE_COOLDOWN_MS);
    this.callerSignal = opts?.callerSignal;
    this.onDetach = opts?.onDetach;
    this.log = opts?.log ?? logger;
  }

  private staleLimit(storedTtl: number, capMs: number | undefined, budget: StaleBudget): number {
    const base = budget === "swr" ? storedTtl + SWR_STALE_EXTRA_MS : maxStaleMs(storedTtl);
    return capMs == null ? base : Math.min(capMs, base);
  }

  private usableStale<T>(
    ttl: number,
    mem: { d: T; e: number; t: number } | undefined,
    kvHit: { env: StaleEnvelope<T> } | undefined,
    budget: StaleBudget,
    capMs?: number,
  ): { value: T } | undefined {
    const now = Date.now();
    const candidates: { value: T; expiresAt: number; storedTtl: number }[] = [];
    if (kvHit) candidates.push({ value: kvHit.env.d, expiresAt: kvHit.env.e, storedTtl: kvHit.env.t ?? ttl });
    if (mem) candidates.push({ value: mem.d, expiresAt: mem.e, storedTtl: mem.t });
    let freshest: { value: T; expiresAt: number } | undefined;
    for (const candidate of candidates) {
      if (now - candidate.expiresAt > this.staleLimit(candidate.storedTtl, capMs, budget)) continue;
      if (freshest === undefined || candidate.expiresAt > freshest.expiresAt) {
        freshest = { value: candidate.value, expiresAt: candidate.expiresAt };
      }
    }
    return freshest === undefined ? undefined : { value: freshest.value };
  }

  private async loadStaleOrRefresh<T>(
    vk: string,
    ttl: number,
    fn: () => Promise<{ data: T; ttl?: number }>,
    mem: { d: T; e: number; t: number } | undefined,
    kvHit: { env: StaleEnvelope<T> } | undefined,
    kv: KvStore | undefined,
    opts?: { staleCapMs?: number },
  ): Promise<CacheResult<T>> {
    if (this.onDetach) {
      const stale = this.usableStale(ttl, mem, kvHit, "swr", opts?.staleCapMs);
      if (stale) {
        noteCacheStat("staleServed");
        const refresh = this.refreshRunner.run(vk, ttl, fn, kv);
        try {
          this.onDetach(refresh.then(undefined, () => {}));
        } catch (err) {
          this.log("warn", `[cache] onDetach callback failed: ${errMsg(err)}`);
        }
        // Serving a complete-but-stale copy while a detached refresh runs is normal stale-while-revalidate, not a data
        // gap: flagging it partial would show "some sources failed" on routine post-TTL requests. A refresh that
        // actually fails still degrades below.
        return { value: stale.value, degraded: false };
      }
    }
    try {
      noteCacheStat("cacheMisses");
      return { value: await this.refreshRunner.run(vk, ttl, fn, kv), degraded: false };
    } catch (err) {
      const stale = this.usableStale(ttl, mem, kvHit, "fallback", opts?.staleCapMs);
      if (!stale) throw err;
      noteCacheStat("staleServed");
      return { value: stale.value, degraded: true };
    }
  }

  async withTtlResult<T>(
    k: string,
    ttl: number,
    fn: () => Promise<{ data: T; ttl?: number }>,
    opts?: { memoryOnly?: boolean; staleCapMs?: number },
  ): Promise<CacheResult<T>> {
    const signal = this.callerSignal;
    if (!signal) return this.withTtlInner(k, ttl, fn, opts);
    if (signal.aborted) throw new ClientAbortError(`Client aborted request for ${k}`);
    const work = this.withTtlInner(k, ttl, fn, opts);
    return raceAbort(
      work,
      signal,
      () => new ClientAbortError(`Client aborted request for ${k}`),
      () => this.onDetach?.(work.then(undefined, () => {})),
    );
  }

  private async withTtlInner<T>(
    k: string,
    ttl: number,
    fn: () => Promise<{ data: T; ttl?: number }>,
    opts?: { memoryOnly?: boolean; staleCapMs?: number },
  ): Promise<CacheResult<T>> {
    try {
      const kv = opts?.memoryOnly === true ? undefined : this.kv;
      const vk = this.tier.vk(k);
      const mem = sharedL1.get<T>(vk);
      if (mem && mem.e > Date.now()) {
        noteCacheStat("l1Hits");
        return { value: mem.d, degraded: false };
      }
      if (!kv) {
        if (!mem) {
          noteCacheStat("cacheMisses");
          return { value: await this.refreshRunner.run(vk, ttl, fn, kv), degraded: false };
        }
        return this.loadStaleOrRefresh(vk, ttl, fn, mem, undefined, kv, opts);
      }
      const hit = await this.tier.getVersioned<T>(kv, k);
      if (!hit) {
        if (!mem) {
          noteCacheStat("cacheMisses");
          return { value: await this.refreshRunner.run(vk, ttl, fn, kv), degraded: false };
        }
        return this.loadStaleOrRefresh(vk, ttl, fn, mem, undefined, kv, opts);
      }
      if (hit.env.e > Date.now()) {
        noteCacheStat("kvHits");
        sharedL1.set(vk, hit.env.d, l1TtlFor(hit.env.e - Date.now()), hit.bytes, hit.env.t ?? ttl);
        return { value: hit.env.d, degraded: false };
      }
      return this.loadStaleOrRefresh(vk, ttl, fn, mem, hit, kv, opts);
    } finally {
      flushCacheStats(this.log);
    }
  }
}
