import { isTimeoutLike, UpstreamError } from "@/server/infra/errors";

export const FAILURE_COOLDOWN_MS = 45_000;
const FAILURE_COOLDOWN_MAX_KEYS = 512;

class FailureCooldown {
  private lastFail = new Map<string, { at: number; timeout: boolean; windowMs?: number }>();

  shouldSkip(key: string, windowMs: number): boolean {
    const entry = this.lastFail.get(key);
    if (entry == null) return false;
    if (Date.now() - entry.at < (entry.windowMs ?? windowMs)) return true;
    this.lastFail.delete(key);
    return false;
  }

  wasTimeout(key: string): boolean {
    return this.lastFail.get(key)?.timeout === true;
  }

  record(key: string, err?: unknown): void {
    const now = Date.now();
    const timeout = isTimeoutLike(err);
    const windowMs = err instanceof UpstreamError ? err.retryAfterMs : undefined;
    this.lastFail.delete(key);
    this.lastFail.set(key, windowMs != null ? { at: now, timeout, windowMs } : { at: now, timeout });
    if (this.lastFail.size <= FAILURE_COOLDOWN_MAX_KEYS) return;
    for (const [k, t] of this.lastFail) {
      if (now - t.at >= (t.windowMs ?? FAILURE_COOLDOWN_MS)) this.lastFail.delete(k);
    }
    while (this.lastFail.size > FAILURE_COOLDOWN_MAX_KEYS) {
      const oldest = this.lastFail.keys().next();
      if (oldest.done) break;
      this.lastFail.delete(oldest.value);
    }
  }

  clear(): void {
    this.lastFail.clear();
  }
}

export const refreshFailureCooldown = new FailureCooldown();
