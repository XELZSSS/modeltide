import { INFLIGHT_HANG_GUARD_MS } from "@/server/config";
import { ClientAbortError, UpstreamError, isTimeoutLike } from "@/server/infra/errors";
import { pruneBounded } from "@/server/infra/throttle";
import type { KvStore } from "./kv";
import type { TierStore } from "./tier-store";

// ---------- failure cooldown ----------

export const FAILURE_COOLDOWN_MS = 45_000;
const FAILURE_COOLDOWN_MAX_KEYS = 512;

class FailureCooldown {
  private lastFail = new Map<string, { at: number; timeout: boolean; windowMs?: number }>();

  shouldSkip(key: string, windowMs: number): { skip: boolean; wasTimeout: boolean } {
    const entry = this.lastFail.get(key);
    if (entry == null) return { skip: false, wasTimeout: false };
    if (Date.now() - entry.at < (entry.windowMs ?? windowMs)) {
      return { skip: true, wasTimeout: entry.timeout };
    }
    this.lastFail.delete(key);
    return { skip: false, wasTimeout: false };
  }

  record(key: string, err?: unknown): void {
    const now = Date.now();
    const timeout = isTimeoutLike(err);
    const windowMs = err instanceof UpstreamError ? err.retryAfterMs : undefined;
    this.lastFail.delete(key);
    this.lastFail.set(key, windowMs != null ? { at: now, timeout, windowMs } : { at: now, timeout });
    pruneBounded(this.lastFail, FAILURE_COOLDOWN_MAX_KEYS, (t) => now - t.at >= (t.windowMs ?? FAILURE_COOLDOWN_MS));
  }

  clear(): void {
    this.lastFail.clear();
  }
}

export const refreshFailureCooldown = new FailureCooldown();

// ---------- inflight registry ----------

export class InflightRegistry {
  private map = new Map<string, Promise<unknown>>();

  get<T>(vk: string): Promise<T> | undefined {
    return this.map.get(vk) as Promise<T> | undefined;
  }

  run<T>(vk: string, p: Promise<T>): Promise<T> {
    this.map.set(vk, p);
    return p;
  }

  release(vk: string, p: Promise<unknown>): void {
    if (this.map.get(vk) === p) this.map.delete(vk);
  }

  clear(): void {
    this.map.clear();
  }
}

export const sharedInflight = new InflightRegistry();

// ---------- refresh runner ----------

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
    const cooldown = refreshFailureCooldown.shouldSkip(vk, this.failureCooldownMs);
    if (cooldown.skip) {
      throw new UpstreamError(`Upstream refresh skipped (failure cooldown) for ${vk}`, {
        timeout: cooldown.wasTimeout,
      });
    }

    let p!: Promise<T>;
    const work = (async (): Promise<T> => {
      const { data, ttl: t } = await fn();
      const current = this.inflight.get(vk);
      if (current !== p) return data;
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
