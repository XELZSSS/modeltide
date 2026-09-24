import { ClientAbortError } from "@/server/infra/errors";
import type { Logger } from "@/server/infra/logger";
import { refreshFailureCooldown, FAILURE_COOLDOWN_MS } from "./cooldown";
import { maxStaleMs, type StaleEnvelope } from "./envelope";
import { l1TtlFor, sharedL1, type MemoryL1 } from "./memory-l1";
import { sharedInflight, type InflightRegistry } from "./inflight";
import type { KvStore } from "./kv";
import { TierStore } from "./tier-store";
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
  ): Promise<T> {
    if (this.onDetach) {
      const stale = this.usableStale(ttl, mem, kvHit, opts?.staleCapMs);
      if (stale) {
        const refresh = this.refreshRunner.run(vk, ttl, fn, kv);
        try {
          this.onDetach(refresh.then(undefined, () => {}));
        } catch {}
        return stale.value;
      }
    }
    try {
      return await this.refreshRunner.run(vk, ttl, fn, kv);
    } catch (err) {
      const stale = this.usableStale(ttl, mem, kvHit, opts?.staleCapMs);
      if (!stale) throw err;
      return stale.value;
    }
  }

  async withTtl<T>(
    k: string,
    ttl: number,
    fn: () => Promise<{ data: T; ttl?: number }>,
    opts?: { memoryOnly?: boolean; staleCapMs?: number },
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
        reject(new ClientAbortError(`Client aborted request for ${k}`));
        try {
          this.onDetach?.(work.then(undefined, () => {}));
        } catch {}
      };
      signal.addEventListener("abort", onAbort, { once: true });
      if (signal.aborted) onAbort();
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
    opts?: { memoryOnly?: boolean; staleCapMs?: number },
  ): Promise<T> {
    const kv = opts?.memoryOnly === true || !this.kv?.available ? undefined : this.kv;
    const vk = this.tier.vk(k);
    const mem = this.l1.get<T>(vk);
    if (mem && mem.e > Date.now()) {
      return mem.d;
    }
    if (!kv) {
      if (!mem) return this.refreshRunner.run(vk, ttl, fn, kv);
      return this.loadStaleOrRefresh(vk, ttl, fn, mem, undefined, kv, opts);
    }
    const hit = await this.tier.getVersioned<T>(kv, k);
    if (!hit) {
      if (!mem) return this.refreshRunner.run(vk, ttl, fn, kv);
      return this.loadStaleOrRefresh(vk, ttl, fn, mem, undefined, kv, opts);
    }
    if (hit.env.e > Date.now()) {
      this.l1.set(vk, hit.env.d, l1TtlFor(hit.env.e - Date.now()), hit.bytes, hit.env.t ?? ttl);
      return hit.env.d;
    }
    return this.loadStaleOrRefresh(vk, ttl, fn, mem, hit, kv, opts);
  }
}
