import { INFLIGHT_HANG_GUARD_MS } from "@/server/config";
import { ClientAbortError, UpstreamError, isTimeoutLike } from "@/server/infra/errors";
import { refreshFailureCooldown } from "./cooldown";
import type { InflightRegistry } from "./inflight";
import type { KvStore } from "./kv";
import type { TierStore } from "./tier-store";

function shouldCoolDown(err: unknown): boolean {
  if (err instanceof ClientAbortError || (err instanceof UpstreamError && err.watchdog)) return false;
  return isTimeoutLike(err) || (err instanceof UpstreamError && (err.retryable || err.statusCode != null));
}

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
    const seq = this.inflight.begin();
    let p!: Promise<T>;
    const task = (async () => {
      const { data, ttl: t } = await fn();
      const current = this.inflight.get(vk);
      if (current !== undefined && current !== p) return data;
      if (!this.inflight.canStore(vk, seq)) return data;
      this.inflight.recordStore(vk, seq);
      await this.tier.storeCurrent(kv, vk, data, t ?? ttl);
      return data;
    })();
    let rejectGuard: (err: unknown) => void = () => {};
    const guardRejection = new Promise<never>((_, reject) => {
      rejectGuard = reject;
    });
    p = this.inflight.run(vk, Promise.race([task, guardRejection]));
    p.then(undefined, () => {});
    const hangTimer = setTimeout(() => {
      this.inflight.release(vk, p);
      rejectGuard(
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
