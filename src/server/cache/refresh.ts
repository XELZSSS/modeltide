import { INFLIGHT_HANG_GUARD_MS } from "@/server/upstream/timeouts";
import { ClientAbortError, UpstreamError, isTimeoutLike } from "@/server/api/errors";
import { pruneBounded } from "@/server/util/throttle";
import { noteCacheStat } from "./stats";
import type { KvStore } from "./kv";
import type { TierStore } from "./store";

export const FAILURE_COOLDOWN_MS = 45_000;
const FAILURE_COOLDOWN_MAX_KEYS = 512;

interface CooldownEntry {
  at: number;
  timeout: boolean;
  statusCode?: number;
  retryAfterMs?: number;
  windowMs?: number;
}

class FailureCooldown {
  private lastFail = new Map<string, CooldownEntry>();

  shouldSkip(key: string, windowMs: number): { skip: false } | { skip: true; entry: CooldownEntry } {
    const entry = this.lastFail.get(key);
    if (entry == null) return { skip: false };
    if (Date.now() - entry.at < (entry.windowMs ?? windowMs)) return { skip: true, entry };
    this.lastFail.delete(key);
    return { skip: false };
  }

  // Everything that shapes the response is kept: remembering only "was it a timeout" turned the first 429
  // (503 + Retry-After) into a generic 502 for the rest of the cooldown window.
  record(key: string, err?: unknown): void {
    const now = Date.now();
    const upstream = err instanceof UpstreamError ? err : undefined;
    const entry: CooldownEntry = { at: now, timeout: isTimeoutLike(err) };
    if (upstream?.statusCode != null) entry.statusCode = upstream.statusCode;
    if (upstream?.retryAfterMs != null) {
      entry.retryAfterMs = upstream.retryAfterMs;
      entry.windowMs = upstream.retryAfterMs;
    }
    this.lastFail.delete(key);
    this.lastFail.set(key, entry);
    pruneBounded(this.lastFail, FAILURE_COOLDOWN_MAX_KEYS, (t) => now - t.at >= (t.windowMs ?? FAILURE_COOLDOWN_MS));
  }

  clear(): void {
    this.lastFail.clear();
  }
}

export const refreshFailureCooldown = new FailureCooldown();

class InflightRegistry {
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
