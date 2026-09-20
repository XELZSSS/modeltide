import { UpstreamError } from "@/server/infra/errors";

export const FAILURE_COOLDOWN_MS = 45_000;
export const FAILURE_COOLDOWN_MAX_KEYS = 512;

export class FailureCooldown {
  private lastFail = new Map<string, { at: number; timeout: boolean }>();

  constructor(private windowMs: number = FAILURE_COOLDOWN_MS) {}

  shouldSkip(key: string, windowMs?: number): boolean {
    const window = windowMs ?? this.windowMs;
    const entry = this.lastFail.get(key);
    if (entry == null) return false;
    if (Date.now() - entry.at < window) return true;
    this.lastFail.delete(key);
    return false;
  }

  /** Whether the recorded failure for key was timeout-caused. */
  wasTimeout(key: string): boolean {
    return this.lastFail.get(key)?.timeout === true;
  }

  record(key: string, err?: unknown): void {
    const now = Date.now();
    const timeout =
      (err instanceof UpstreamError && err.causedByTimeout) || (err instanceof Error && err.name === "TimeoutError");
    this.lastFail.set(key, { at: now, timeout });
    if (this.lastFail.size <= FAILURE_COOLDOWN_MAX_KEYS) return;
    for (const [k, t] of this.lastFail) {
      if (now - t.at >= this.windowMs) this.lastFail.delete(k);
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
