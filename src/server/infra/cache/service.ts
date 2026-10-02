import { raceAbort } from "@/server/infra/abort";
import { ClientAbortError } from "@/server/infra/errors";
import type { Logger } from "@/server/infra/logger";
import { refreshFailureCooldown, FAILURE_COOLDOWN_MS, sharedInflight, type InflightRegistry } from "./refresh";
import { maxStaleMs, type StaleEnvelope, l1TtlFor, sharedL1, type MemoryL1, TierStore } from "./tier-store";
import type { KvStore } from "./kv";
import { RefreshRunner } from "./refresh";

export function resetModuleCachesForTests(): void {
  sharedL1.clear();
  sharedInflight.clear();
  refreshFailureCooldown.clear();
}

interface CacheStores {
  l1?: MemoryL1;
  inflight?: InflightRegistry;
  failureCooldownMs?: number;
  callerSignal?: AbortSignal;
  onDetach?: (work: Promise<unknown>) => void;
  log?: Logger;
}

export interface CacheResult<T> {
  value: T;
  degraded: boolean;
}

export class CacheService {
  private l1: MemoryL1;
  private tier: TierStore;
  private refreshRunner: RefreshRunner;
  private callerSignal?: AbortSignal;
  private onDetach?: (work: Promise<unknown>) => void;

  constructor(
    private kv: KvStore | undefined,
    version: string,
    stores?: CacheStores,
  ) {
    this.l1 = stores?.l1 ?? sharedL1;
    this.tier = new TierStore(version, this.l1, stores?.onDetach, stores?.log);
    this.refreshRunner = new RefreshRunner(
      this.tier,
      stores?.inflight ?? sharedInflight,
      stores?.failureCooldownMs ?? FAILURE_COOLDOWN_MS,
    );
    this.callerSignal = stores?.callerSignal;
    this.onDetach = stores?.onDetach;
  }

  private staleBudget(storedTtl: number, capMs?: number): number {
    const base = maxStaleMs(storedTtl);
    return capMs == null ? base : Math.min(capMs, base);
  }

  private usableStale<T>(
    ttl: number,
    mem: { d: T; e: number; t: number } | undefined,
    kvHit: { env: StaleEnvelope<T> } | undefined,
    capMs?: number,
  ): { value: T } | undefined {
    if (kvHit) {
      const env = kvHit.env;
      return Date.now() - env.e <= this.staleBudget(env.t ?? ttl, capMs) ? { value: env.d } : undefined;
    }
    return mem && Date.now() - mem.e <= this.staleBudget(mem.t, capMs) ? { value: mem.d } : undefined;
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
      const stale = this.usableStale(ttl, mem, kvHit, opts?.staleCapMs);
      if (stale) {
        const refresh = this.refreshRunner.run(vk, ttl, fn, kv);
        try {
          this.onDetach(refresh.then(undefined, () => {}));
        } catch {}
        return { value: stale.value, degraded: false };
      }
    }
    try {
      return { value: await this.refreshRunner.run(vk, ttl, fn, kv), degraded: false };
    } catch (err) {
      const stale = this.usableStale(ttl, mem, kvHit, opts?.staleCapMs);
      if (!stale) throw err;
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
    const kv = opts?.memoryOnly === true || !this.kv?.available ? undefined : this.kv;
    const vk = this.tier.vk(k);
    const mem = this.l1.get<T>(vk);
    if (mem && mem.e > Date.now()) {
      return { value: mem.d, degraded: false };
    }
    if (!kv) {
      if (!mem) return { value: await this.refreshRunner.run(vk, ttl, fn, kv), degraded: false };
      return this.loadStaleOrRefresh(vk, ttl, fn, mem, undefined, kv, opts);
    }
    const hit = await this.tier.getVersioned<T>(kv, k);
    if (!hit) {
      if (!mem) return { value: await this.refreshRunner.run(vk, ttl, fn, kv), degraded: false };
      return this.loadStaleOrRefresh(vk, ttl, fn, mem, undefined, kv, opts);
    }
    if (hit.env.e > Date.now()) {
      this.l1.set(vk, hit.env.d, l1TtlFor(hit.env.e - Date.now()), hit.bytes, hit.env.t ?? ttl);
      return { value: hit.env.d, degraded: false };
    }
    return this.loadStaleOrRefresh(vk, ttl, fn, mem, hit, kv, opts);
  }
}
