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
  /** This caller's liveness: used only to detach it, never to cancel the shared refresh. */
  callerSignal?: AbortSignal;
  /** Keeps an orphaned refresh alive past the request that started it. */
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

  /** The generic stale window, tightened when the caller capped it: a negative cache has to be re-asked soon. */
  private staleBudget(storedTtl: number, capMs?: number): number {
    const base = maxStaleMs(storedTtl);
    return capMs == null ? base : Math.min(capMs, base);
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
    try {
      return await this.refreshRunner.run(vk, ttl, fn, kv);
    } catch (err) {
      if (kvHit) {
        if (Date.now() - kvHit.env.e <= this.staleBudget(kvHit.env.t ?? ttl, opts?.staleCapMs)) {
          return kvHit.env.d;
        }
        throw err;
      }
      if (mem) {
        if (Date.now() - mem.e > this.staleBudget(mem.t, opts?.staleCapMs)) throw err;
        return mem.d;
      }
      throw err;
    }
  }

  // An abort rejects only this caller (499) while the shared refresh keeps running; the race must
  // live here, since `refresh`'s `finally` would release the slot while the promise is pending.
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
        this.onDetach?.(work.then(undefined, () => {}));
        reject(new ClientAbortError(`Client aborted request for ${k}`));
      };
      signal.addEventListener("abort", onAbort, { once: true });
      // An abort can land before listener registration; close that race.
      if (signal.aborted) onAbort();
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
