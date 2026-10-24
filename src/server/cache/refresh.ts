import { INFLIGHT_HANG_GUARD_MS } from "@/server/upstream/timeouts";
import { UpstreamError } from "@/server/api/errors";
import { noteCacheStat } from "./stats";
import { refreshFailureCooldown, shouldCoolDown } from "./failure-cooldown";
import type { SingleFlight } from "./inflight";
import type { KvStore } from "./kv";
import type { TierStore } from "./tier-store";

export interface RefreshResult<T> {
  value: T;
  /** Serialized body, present when this run stored the entry; a displaced run has none. */
  body: string | undefined;
}

/** Runs one refresh per versioned key, with a hang guard, failure cooldown and deduped concurrent callers. */
export class RefreshRunner {
  constructor(
    private tier: TierStore,
    private inflight: SingleFlight,
  ) {}

  async run<T>(
    vk: string,
    ttl: number,
    fn: () => Promise<{ data: T; ttl?: number }>,
    kv: KvStore | undefined,
    serveBody: boolean,
  ): Promise<RefreshResult<T>> {
    const existing = this.inflight.get<RefreshResult<T>>(vk);
    if (existing) return existing;
    refreshFailureCooldown.throwIfCooling(vk);

    let p!: Promise<RefreshResult<T>>;
    const work = (async (): Promise<RefreshResult<T>> => {
      noteCacheStat("refreshes");
      const { data, ttl: t } = await fn();
      // The source answered with a payload, so a failure recorded by an earlier detached attempt is no longer this key's
      // state: keeping it would report the *next* stale read as degraded even though the data was refreshed.
      refreshFailureCooldown.noteRefreshSuccess(vk);
      // The hang guard may have released this refresh and let a new owner register: then the new owner stores and
      // this displaced run only answers its own waiters. With the slot empty or still ours, persist as usual.
      const owner = this.inflight.get(vk);
      if (owner !== undefined && owner !== p) return { value: data, body: undefined };
      return { value: data, body: await this.tier.storeCurrent(kv, vk, data, t ?? ttl, serveBody) };
    })();

    let hangGuardReject: (err: unknown) => void = () => {};
    const hangGuard = new Promise<never>((_, reject) => {
      hangGuardReject = reject;
    });
    p = this.inflight.insert(vk, Promise.race([work, hangGuard]));
    p.then(undefined, () => {});

    const hangTimer = setTimeout(() => {
      this.inflight.release(vk, p);
      hangGuardReject(
        new UpstreamError(`Upstream refresh timed out (inflight guard) for ${vk}`, { timeout: true, watchdog: true }),
      );
    }, INFLIGHT_HANG_GUARD_MS);

    try {
      return await p;
    } catch (err) {
      if (shouldCoolDown(err)) refreshFailureCooldown.record(vk, err);
      throw err;
    } finally {
      clearTimeout(hangTimer);
      this.inflight.release(vk, p);
    }
  }
}
