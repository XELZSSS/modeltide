import { raceAbort } from "@/server/util/abort";
import { ClientAbortError, errMsg } from "@/server/api/errors";
import { logger, type Logger } from "@/server/api/logger";
import { refreshFailureCooldown } from "./failure-cooldown";
import { sharedInflight, sharedReads } from "./inflight";
import { l1TtlFor, sharedL1, type MemoryEntry } from "./l1";
import { pickFreshestStale, type StaleBudget, type StaleCandidate } from "./stale";
import { TierStore } from "./tier-store";
import { flushCacheStats, noteCacheStat, resetCacheStats } from "./stats";
import type { DecodedEnvelope } from "./envelope";
import type { CacheResult, CacheScope } from "./types";
import type { KvStore } from "./kv";
import { RefreshRunner } from "./refresh";

export function resetModuleCachesForTests(): void {
  sharedL1.clear();
  sharedInflight.clear();
  sharedReads.clear();
  refreshFailureCooldown.clear();
  resetCacheStats();
}

interface CacheOptions {
  callerSignal?: AbortSignal;
  onDetach?: (work: Promise<unknown>) => void;
  log?: Logger;
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
    this.refreshRunner = new RefreshRunner(this.tier, sharedInflight);
    this.callerSignal = opts?.callerSignal;
    this.onDetach = opts?.onDetach;
    this.log = opts?.log ?? logger;
  }

  private usableStale<T>(
    ttl: number,
    mem: MemoryEntry<T> | undefined,
    kvHit: DecodedEnvelope<T> | undefined,
    budget: StaleBudget,
    capMs?: number,
  ): { value: T } | undefined {
    const candidates: StaleCandidate<T>[] = [];
    if (kvHit) candidates.push({ value: kvHit.env.d, expiresAt: kvHit.env.e, storedTtl: kvHit.env.t ?? ttl });
    if (mem) candidates.push({ value: mem.d, expiresAt: mem.e, storedTtl: mem.t });
    const freshest = pickFreshestStale(candidates, budget, capMs);
    return freshest === undefined ? undefined : { value: freshest.value };
  }

  private async loadStaleOrRefresh<T>(
    vk: string,
    ttl: number,
    fn: () => Promise<{ data: T; ttl?: number }>,
    mem: MemoryEntry<T> | undefined,
    kvHit: DecodedEnvelope<T> | undefined,
    kv: KvStore | undefined,
    scope?: CacheScope,
  ): Promise<CacheResult<T>> {
    if (this.onDetach) {
      const stale = this.usableStale(ttl, mem, kvHit, "swr", scope?.staleCapMs);
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
      const stale = this.usableStale(ttl, mem, kvHit, "fallback", scope?.staleCapMs);
      if (!stale) throw err;
      noteCacheStat("staleServed");
      return { value: stale.value, degraded: true };
    }
  }

  async withTtlResult<T>(
    k: string,
    ttl: number,
    fn: () => Promise<{ data: T; ttl?: number }>,
    scope?: CacheScope,
  ): Promise<CacheResult<T>> {
    const signal = this.callerSignal;
    if (!signal) return this.withTtlInner(k, ttl, fn, scope);
    if (signal.aborted) throw new ClientAbortError(`Client aborted request for ${k}`);
    const work = this.withTtlInner(k, ttl, fn, scope);
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
    scope?: CacheScope,
  ): Promise<CacheResult<T>> {
    try {
      const kv = scope?.memoryOnly === true ? undefined : this.kv;
      const vk = this.tier.vk(k);
      const mem = sharedL1.get<T>(vk);
      if (mem && mem.e > Date.now()) {
        noteCacheStat("l1Hits");
        return { value: mem.d, degraded: false };
      }
      const hit = kv ? await this.tier.getVersioned<T>(kv, k) : undefined;
      if (hit && hit.env.e > Date.now()) {
        noteCacheStat("kvHits");
        sharedL1.set(vk, hit.env.d, l1TtlFor(hit.env.e - Date.now()), hit.bytes, hit.env.t ?? ttl);
        return { value: hit.env.d, degraded: false };
      }
      if (!mem && !hit) {
        noteCacheStat("cacheMisses");
        return { value: await this.refreshRunner.run(vk, ttl, fn, kv), degraded: false };
      }
      return this.loadStaleOrRefresh(vk, ttl, fn, mem, hit, kv, scope);
    } finally {
      flushCacheStats(this.log);
    }
  }
}
