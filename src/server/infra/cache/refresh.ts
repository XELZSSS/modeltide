import { INFLIGHT_HANG_GUARD_MS } from "@/server/config";
import { ClientAbortError, UpstreamError } from "@/server/infra/errors";
import { refreshFailureCooldown } from "./cooldown";
import type { InflightRegistry } from "./inflight";
import type { KvStore } from "./kv";
import type { TierStore } from "./tier-store";

export class RefreshRunner {
  constructor(
    private tier: TierStore,
    private inflight: InflightRegistry,
    private failureCooldownMs: number,
  ) {}

  async run<T>(
    vk: string,
    ttl: number,
    fn: () => Promise<{ data: T; ttl?: number }>,
    kv: KvStore | undefined,
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
      // Only a DIFFERENT promise means a newer round owns the key; an absent registration is
      // the hang guard having released ours, so this result still belongs in the cache.
      const current = this.inflight.get(vk);
      if (current !== undefined && current !== p) return data;
      await this.tier.storeCurrent(kv, vk, data, t ?? ttl);
      return data;
    })();
    let rejectGuard: (err: unknown) => void = () => {};
    const guardRejection = new Promise<never>((_, reject) => {
      rejectGuard = reject;
    });
    // The guarded promise joins the registry, so joiners inherit the starter's deadline.
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
