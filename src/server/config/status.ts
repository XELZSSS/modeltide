export const SAMPLE_LOCK_TTL_S = 300;
export const HISTORY_KV_RETENTION_TTL_S = 90 * 24 * 60 * 60;
// Hourly cron on the free plan: only self-heal from user traffic when more
// than one scheduled round was missed, otherwise every hourly tick would look
// "stale" for 15 minutes and trigger duplicate sampling on the hot path.
export const SAMPLE_SELF_HEAL_MS = 90 * 60 * 1000;

const KV_READ_WARN_THROTTLE_MS = 30 * 60 * 1000;
export const UNKNOWN_QUERY_WARN_THROTTLE_MS = 30 * 60 * 1000;
export const UNKNOWN_QUERY_WARN_MAX_PATHS = 64;

export const STALE_SAMPLE_WARN_MS = 2 * 60 * 60 * 1000;
export const STALE_WARN_THROTTLE_MS = 30 * 60 * 1000;

export function throttleGate(intervalMs: number): { open: () => boolean } {
  let last = 0;
  return {
    open: () => {
      const now = Date.now();
      if (now - last < intervalMs) return false;
      last = now;
      return true;
    },
  };
}

export const kvReadWarnGate = throttleGate(KV_READ_WARN_THROTTLE_MS);

export function keyedThrottleGate(intervalMs: number, maxKeys: number): (key: string) => boolean {
  const last = new Map<string, number>();
  return (key) => {
    const now = Date.now();
    const previous = last.get(key);
    if (previous != null && now - previous < intervalMs) return false;
    last.delete(key);
    last.set(key, now);
    if (last.size <= maxKeys) return true;
    for (const [k, at] of last) {
      if (now - at >= intervalMs) last.delete(k);
    }
    while (last.size > maxKeys) {
      const oldest = last.keys().next();
      if (oldest.done) break;
      last.delete(oldest.value);
    }
    return true;
  };
}
