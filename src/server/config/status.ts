export const SAMPLE_LOCK_TTL_S = 120;
export const HISTORY_KV_RETENTION_TTL_S = 90 * 24 * 60 * 60;
/** 1.5x the 30-min cron cadence: one missed round, then a read refills the gap. */
export const SAMPLE_SELF_HEAL_MS = 45 * 60 * 1000;

export const KV_READ_WARN_THROTTLE_MS = 30 * 60 * 1000;

export const STALE_SAMPLE_WARN_MS = 2 * 60 * 60 * 1000;
export const STALE_WARN_THROTTLE_MS = 30 * 60 * 1000;
