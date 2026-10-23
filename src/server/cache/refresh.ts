import { INFLIGHT_HANG_GUARD_MS } from "@/server/upstream/timeouts";
import { UpstreamError } from "@/server/api/errors";
import { noteCacheStat } from "./stats";
import { FAILURE_COOLDOWN_MS, refreshFailureCooldown, shouldCoolDown } from "./failure-cooldown";
import type { InflightRegistry } from "./inflight";
import type { KvStore } from "./kv";
import type { TierStore } from "./tier-store";

/** Runs one refresh per versioned key, with a hang guard, failure cooldown and deduped concurrent callers. */
export class RefreshRunner {
  constructor(
    private tier: TierStore,
    private inflight: InflightRegistry,
  ) {}

  async run<T>(
    vk: string,
    ttl: number,
    fn: () => Promise<{ data: T; ttl?: number }>,
    kv: KvStore | undefined,
  ): Promise<T> {
    const existing = this.inflight.get<T>(vk);
    if (existing) return existing;
    const cooldown = refreshFailureCooldown.shouldSkip(vk, FAILURE_COOLDOWN_MS);
    if (cooldown.skip) {
      const { entry } = cooldown;
      throw new UpstreamError(`Upstream refresh skipped (failure cooldown) for ${vk}`, {
        ...(entry.timeout ? { timeout: true } : {}),
        ...(entry.statusCode != null ? { status: entry.statusCode } : {}),
        ...(entry.retryAfterMs != null ? { retryAfterMs: entry.retryAfterMs } : {}),
      });
    }

    let p!: Promise<T>;
    const work = (async (): Promise<T> => {
      noteCacheStat("refreshes");
      const { data, ttl: t } = await fn();
      const owner = this.inflight.get(vk);
      if (owner !== undefined && owner !== p) return data;
      await this.tier.storeCurrent(kv, vk, data, t ?? ttl);
      return data;
    })();

    let hangGuardReject: (err: unknown) => void = () => {};
    const hangGuard = new Promise<never>((_, reject) => {
      hangGuardReject = reject;
    });
    p = this.inflight.run(vk, Promise.race([work, hangGuard]));
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
