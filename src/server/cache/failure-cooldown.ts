import { ClientAbortError, UpstreamError, isTimeoutLike } from "@/server/api/errors";
import { pruneBounded } from "@/server/util/throttle";

const FAILURE_COOLDOWN_MS = 45_000;
const FAILURE_COOLDOWN_MAX_KEYS = 512;

export interface CooldownEntry {
  at: number;
  timeout: boolean;
  statusCode?: number;
  retryAfterMs?: number;
  windowMs?: number;
}

/** Remembers the last refresh failure per key so a dead upstream is not retried on every request. */
export class FailureCooldown {
  private lastFail = new Map<string, CooldownEntry>();
  /** Keys whose detached refresh failed: the failure is known, but no attempt was awaited, so there is no cooldown. */
  private staleFailures = new Map<string, number>();

  /**
   * The recorded entry for `key` while it is still inside its cooldown window, dropping it once the window has passed.
   * Both readers below go through here so they cannot disagree about when a window ends.
   */
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

  /**
   * Whether `key`'s refresh is known to be failing: either a failure was recorded by the detached stale-while-
   * revalidate refresh (`noteRefreshFailure`), or a refresh attempt is inside its cooldown. The cache reads this
   * before serving a stale copy — one whose refresh has failed can no longer be brought up to date, so it has to be
   * reported as degraded instead of as current data.
   */
  isFailing(key: string): boolean {
    return this.liveStaleFailure(key) || this.liveEntry(key) !== undefined;
  }

  /**
   * Records that a detached refresh failed — the read side of a failure whose response was already written.
   * `RefreshRunner` only cools down failures it awaited (`shouldCoolDown`), while the stale-while-revalidate path
   * hands its rejection to `onDetach` and answers immediately. Without this record the next request served the same
   * stale bytes as current data with `partial: false`, and the client's partial-poll never started.
   *
   * A client abort is not a source failure: the reader went away, and the next reader should still get a normal answer.
   */
  noteRefreshFailure(key: string, err: unknown): void {
    if (err instanceof ClientAbortError) return;
    this.staleFailures.delete(key);
    this.staleFailures.set(key, Date.now());
    pruneBounded(this.staleFailures, FAILURE_COOLDOWN_MAX_KEYS, (at) => Date.now() - at >= FAILURE_COOLDOWN_MS);
  }

  /**
   * Records that a refresh reached the source and produced a payload. A recorded failure describes a key that could not
   * be brought up to date; once it has been, the record has to go, or the next stale read of that key reports a data gap
   * for a refresh that has since succeeded. `lastFail` needs no counterpart: `RefreshRunner` refuses to start a refresh
   * inside that window (`throwIfCooling`), so a success is only reachable with no live entry there.
   */
  noteRefreshSuccess(key: string): void {
    this.staleFailures.delete(key);
  }

  /**
   * Rethrows the recorded failure while `key` lies inside its cooldown window — the failure's response shape
   * (timeout/statusCode/retryAfterMs) is preserved so a 429 keeps surfacing as 503 + Retry-After for the rest of
   * the window instead of degrading to a generic 502.
   */
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

/**
 * A client abort or an inflight-watchdog timeout says nothing about upstream health. Every other UpstreamError does —
 * a 5xx, a rate limit, and also a 200 whose body was unusable (zero rows, oversized payload, invalid JSON): retrying
 * those on every request is what turns one bad upstream response into a per-request stampede.
 */
export function shouldCoolDown(err: unknown): boolean {
  if (err instanceof ClientAbortError) return false;
  if (err instanceof UpstreamError) return !err.watchdog;
  return isTimeoutLike(err);
}
