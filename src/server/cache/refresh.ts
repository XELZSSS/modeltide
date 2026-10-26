import { INFLIGHT_HANG_GUARD_MS } from "@/server/upstream/timeouts";
import { UpstreamError } from "@/server/api/errors";
import { noteCacheStat } from "./stats";
import { refreshFailureCooldown, shouldCoolDown } from "./failure-cooldown";
import { sharedInflight } from "./inflight";
import type { KvStore } from "./kv";
import type { TierStore } from "./tier-store";

interface RefreshResult<T> {
  value: T;
  /** Serialized body, present when this run stored the entry; a displaced run has none. */
  body: string | undefined;
  /** When this run produced the payload; a displaced run did not store it, so it stamps its own moment. */
  producedAt: number;
}

/** Runs one refresh per versioned key, with a hang guard, failure cooldown and deduped concurrent callers. */
export class RefreshRunner {
  constructor(private tier: TierStore) {}

  async run<T>(
    vk: string,
    ttl: number,
    fn: () => Promise<{ data: T; ttl?: number }>,
    kv: KvStore | undefined,
    serveBody: boolean,
  ): Promise<RefreshResult<T>> {
    const existing = sharedInflight.get<RefreshResult<T>>(vk);
    if (existing) return existing;
    refreshFailureCooldown.throwIfCooling(vk);

    let p!: Promise<RefreshResult<T>>;
    const work = (async (): Promise<RefreshResult<T>> => {
      noteCacheStat("refreshes");
      const { data, ttl: t } = await fn();
      // The source answered with a payload, so a failure recorded by an earlier detached attempt is no longer this key's
      // state: keeping it would report the *next* stale read as degraded even though the data was refreshed.
      refreshFailureCooldown.noteRefreshSuccess(vk);
      // Only the run that still owns this key may persist. `owner` is `p` for a normal run — the slot is released in
      // `finally`, after `work` has stored — so anything else means the hang guard took the slot away: another attempt
      // owns it now, or owned it and already finished (an empty slot cannot be told apart from that). Persisting then
      // would overwrite a fresher generation with this late completion, so a displaced run only answers its waiters.
      const owner = sharedInflight.get(vk);
      if (owner !== p) return { value: data, body: undefined, producedAt: Date.now() };
      const stored = await this.tier.storeCurrent(kv, vk, data, t ?? ttl, serveBody);
      return { value: data, body: stored.body, producedAt: stored.producedAt };
    })();

    let hangGuardReject: (err: unknown) => void = () => {};
    const hangGuard = new Promise<never>((_, reject) => {
      hangGuardReject = reject;
    });
    p = sharedInflight.insert(vk, Promise.race([work, hangGuard]));
    p.then(undefined, () => {});

    const hangTimer = setTimeout(() => {
      sharedInflight.release(vk, p);
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
      sharedInflight.release(vk, p);
    }
  }
}
