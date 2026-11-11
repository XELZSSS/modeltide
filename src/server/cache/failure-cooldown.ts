import { ClientAbortError, UpstreamError, isTimeoutLike } from "@/server/api/errors";
import { pruneBounded } from "@/server/util/throttle";

const FAILURE_COOLDOWN_MS = 45_000;
const FAILURE_COOLDOWN_MAX_KEYS = 512;

interface CooldownEntry {
  at: number;
  timeout: boolean;
  statusCode?: number;
  retryAfterMs?: number;
  windowMs?: number;
}

/** Remembers the last refresh failure per key so a dead upstream is not retried on every request. */
class FailureCooldown {
  private lastFail = new Map<string, CooldownEntry>();
  /** Keys whose detached refresh failed: the failure is known, but no attempt was awaited, so there is no cooldown. */
  private staleFailures = new Map<string, number>();

  /** The recorded entry for `key` while it is still inside its cooldown window, dropping it once the window has passed. */
  private liveEntry(key: string): CooldownEntry | undefined {
    const entry = this.lastFail.get(key);
    if (entry == null) return undefined;
    if (Date.now() - entry.at >= (entry.windowMs ?? FAILURE_COOLDOWN_MS)) {
      this.lastFail.delete(key);
      return undefined;
    }
    return entry;
  }

  /** Drops `key`'s detached-refresh failure once its cooldown window has passed, so an old record cannot outlive it. */
  private liveStaleFailure(key: string): boolean {
    const at = this.staleFailures.get(key);
    if (at == null) return false;
    if (Date.now() - at >= FAILURE_COOLDOWN_MS) {
      this.staleFailures.delete(key);
      return false;
    }
    return true;
  }

  /** Whether `key`'s refresh is known to be failing: a failure recorded by a detached refresh or an attempt inside its cooldown, which makes a stale copy degraded instead of current data. */
  isFailing(key: string): boolean {
    return this.liveStaleFailure(key) || this.liveEntry(key) !== undefined;
  }

  /** Records that a detached refresh failed — a failure whose response was already written — so the next request does not serve the same stale bytes as current data; a client abort is not a source failure. */
  noteRefreshFailure(key: string, err: unknown): void {
    if (err instanceof ClientAbortError) return;
    this.staleFailures.delete(key);
    this.staleFailures.set(key, Date.now());
    pruneBounded(this.staleFailures, FAILURE_COOLDOWN_MAX_KEYS, (at) => Date.now() - at >= FAILURE_COOLDOWN_MS);
  }

  /** Records that a refresh produced a payload: a recorded failure has to go, or the next stale read reports a data gap for a refresh that has since succeeded. */
  noteRefreshSuccess(key: string): void {
    this.staleFailures.delete(key);
  }

  /** Rethrows the recorded failure inside its cooldown window, preserving its shape so a 429 keeps surfacing as 503 + Retry-After instead of a generic 502. */
  throwIfCooling(key: string): void {
    const entry = this.liveEntry(key);
    if (entry == null) return;
    throw new UpstreamError(`Upstream refresh skipped (failure cooldown) for ${key}`, {
      ...(entry.timeout ? { timeout: true } : {}),
      ...(entry.statusCode != null ? { status: entry.statusCode } : {}),
      ...(entry.retryAfterMs != null ? { retryAfterMs: entry.retryAfterMs } : {}),
    });
  }

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
    this.staleFailures.clear();
  }
}

export const refreshFailureCooldown = new FailureCooldown();

/** A client abort or an inflight-watchdog timeout says nothing about upstream health; every other UpstreamError does — a 5xx, a rate limit, and a 200 whose body was unusable. */
export function shouldCoolDown(err: unknown): boolean {
  if (err instanceof ClientAbortError) return false;
  if (err instanceof UpstreamError) return !err.watchdog;
  return isTimeoutLike(err);
}
