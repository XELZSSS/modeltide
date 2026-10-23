import { ClientAbortError, UpstreamError, isTimeoutLike } from "@/server/api/errors";
import { pruneBounded } from "@/server/util/throttle";

export const FAILURE_COOLDOWN_MS = 45_000;
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

/** A client abort or an inflight-watchdog timeout says nothing about upstream health. */
export function shouldCoolDown(err: unknown): boolean {
  if (err instanceof ClientAbortError || (err instanceof UpstreamError && err.watchdog)) return false;
  return isTimeoutLike(err) || (err instanceof UpstreamError && (err.retryable || err.statusCode != null));
}
