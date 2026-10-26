import { raceAbort } from "@/server/util/abort";
import { ClientAbortError, errMsg } from "@/server/api/errors";
import { logger, type Logger } from "@/server/api/logger";
import { refreshFailureCooldown, shouldCoolDown } from "./failure-cooldown";
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

type Loader<T> = () => Promise<{ data: T; ttl?: number }>;

/**
 * Everything the miss/expired path needs, as one object: the same values as positional parameters made
 * `refreshOrStale`'s call site unreadable and let `serveBody` travel beside the `scope` it was derived from.
 */
interface Miss<T> {
  vk: string;
  ttl: number;
  fn: Loader<T>;
  mem: MemoryEntry<T> | undefined;
  kvHit: DecodedEnvelope<T> | undefined;
  kv: KvStore | undefined;
  scope: CacheScope | undefined;
}

/** One definition for the two places that need it, so `scope` and `serveBody` cannot disagree. */
function serveBodyOf(scope: CacheScope | undefined): boolean {
  return scope?.serveBody !== false;
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
    this.refreshRunner = new RefreshRunner(this.tier);
    this.callerSignal = opts?.callerSignal;
    this.onDetach = opts?.onDetach;
    this.log = opts?.log ?? logger;
  }

  /** The freshest expired copy still inside `budget`, drawn from the KV entry and the L1 mirror together. */
  private usableStale<T>(miss: Miss<T>, budget: StaleBudget): StaleCandidate<T> | undefined {
    const includeBody = serveBodyOf(miss.scope);
    const candidates: StaleCandidate<T>[] = [];
    if (miss.kvHit) {
      candidates.push({
        value: miss.kvHit.env.d,
        expiresAt: miss.kvHit.env.e,
        storedTtl: miss.kvHit.env.t,
        storedAt: miss.kvHit.env.f,
        body: includeBody ? miss.kvHit.body : undefined,
      });
    }
    if (miss.mem) {
      candidates.push({
        value: miss.mem.d,
        expiresAt: miss.mem.e,
        storedTtl: miss.mem.t,
        storedAt: miss.mem.f,
        body: includeBody ? miss.mem.s : undefined,
      });
    }
    const capOf = miss.scope?.staleCapMs;
    const capFor = (candidate: StaleCandidate<T>): number | undefined => capOf?.(candidate.value);
    return pickFreshestStale(candidates, budget, capFor);
  }

  /**
   * Miss/expired tail: serve a stale copy stale-while-revalidate when possible, otherwise refresh in-band and fall
   * back to the freshest stale copy within the fallback budget when the refresh fails.
   */
  private async refreshOrStale<T>(miss: Miss<T>): Promise<CacheResult<T>> {
    const { vk, ttl, fn, kv } = miss;
    const serveBody = serveBodyOf(miss.scope);
    // Serving a complete-but-stale copy while a detached refresh runs is normal stale-while-revalidate, not a data
    // gap: flagging it degraded would show "some sources failed" on routine post-TTL requests.
    //
    // A copy whose refresh is *known to have failed* is the other case: it is a data gap, and it has to be reported
    // as one. The detached refresh below answers the current request immediately and swallows its rejection, so the
    // failure used to stay invisible — the reader kept `partial: false` on a copy that could no longer be brought up
    // to date, the partial notice never appeared, and the client's partial-poll never started. `isFailing` covers
    // both shapes of that failure: one recorded by a previous detached refresh (`noteRefreshFailure`), and one whose
    // attempt is inside the cooldown `RefreshRunner` sets when it awaits a failure itself.
    const degraded = refreshFailureCooldown.isFailing(vk);
    if (this.onDetach) {
      const stale = this.usableStale(miss, "swr");
      if (stale) {
        // The entry is expired, so this request is a miss for the same reason the in-band refresh below is: nothing
        // fresh was served. Counting it only on the synchronous path left `l1Hits + kvHits + cacheMisses` short of the
        // request count by exactly the number of stale-but-usable reads.
        noteCacheStat("cacheMisses");
        noteCacheStat("staleServed");
        // `shouldCoolDown` keeps a client abort out of the cooldown, and `noteRefreshFailure` applies the same rule, so a
        // reader that went away does not make the next reader see a degraded answer.
        const refresh = this.refreshRunner.run(vk, ttl, fn, kv, serveBody).catch((err: unknown) => {
          if (shouldCoolDown(err)) refreshFailureCooldown.noteRefreshFailure(vk, err);
        });
        try {
          this.onDetach(refresh);
        } catch (err) {
          this.log("warn", `[cache] onDetach callback failed: ${errMsg(err)}`);
        }
        return { value: stale.value, degraded, body: stale.body, producedAt: stale.storedAt };
      }
    }
    try {
      noteCacheStat("cacheMisses");
      const refreshed = await this.refreshRunner.run(vk, ttl, fn, kv, serveBody);
      return { value: refreshed.value, degraded: false, body: refreshed.body, producedAt: refreshed.producedAt };
    } catch (err) {
      const stale = this.usableStale(miss, "fallback");
      if (!stale) throw err;
      noteCacheStat("staleServed");
      return { value: stale.value, degraded: true, body: stale.body, producedAt: stale.storedAt };
    }
  }

  async withTtlResult<T>(k: string, ttl: number, fn: Loader<T>, scope?: CacheScope): Promise<CacheResult<T>> {
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
    fn: Loader<T>,
    scope: CacheScope | undefined,
  ): Promise<CacheResult<T>> {
    const now = Date.now();
    try {
      const kv = this.kv;
      const vk = this.tier.vk(k);
      const serveBody = serveBodyOf(scope);
      const mem = sharedL1.get<T>(vk);
      if (mem && mem.e > now) {
        noteCacheStat("l1Hits");
        return { value: mem.d, degraded: false, body: serveBody ? mem.s : undefined, producedAt: mem.f };
      }
      const hit = kv ? await this.tier.getVersioned<T>(kv, k) : undefined;
      if (hit && hit.env.e > now) {
        // The KV read above is an await, so a concurrent refresh may have stored a fresher generation in this isolate's
        // L1 while it was in flight. Serving and then re-storing the older KV copy would hand out superseded data as
        // fresh and pin it there until that L1 entry aged out, so the newer copy wins and is never overwritten.
        const fresher = sharedL1.get<T>(vk);
        if (fresher !== undefined && fresher.e > now && fresher.f > hit.env.f) {
          noteCacheStat("l1Hits");
          return { value: fresher.d, degraded: false, body: serveBody ? fresher.s : undefined, producedAt: fresher.f };
        }
        noteCacheStat("kvHits");
        const retained = serveBody ? hit.body : undefined;
        sharedL1.set(vk, hit.env.d, l1TtlFor(hit.env.e - now), hit.bytes, hit.env.t, hit.env.f, retained);
        return { value: hit.env.d, degraded: false, body: retained, producedAt: hit.env.f };
      }
      return this.refreshOrStale({ vk, ttl, fn, mem, kvHit: hit, kv, scope });
    } finally {
      flushCacheStats(this.log);
    }
  }
}
