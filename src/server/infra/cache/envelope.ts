import { ONE_DAY } from "@/shared/config";

export const STALE_WINDOW_MS = ONE_DAY;
export const MAX_STALE_EXTRA_MS = 60 * 60_000;

export function maxStaleMs(ttl: number): number {
  if (!Number.isFinite(ttl) || ttl <= 0) return MAX_STALE_EXTRA_MS;
  return Math.min(2 * ttl + MAX_STALE_EXTRA_MS, STALE_WINDOW_MS);
}

/**
 * KV payload envelope. Generation-locked: entries only ever exist under the
 * key prefix of the CACHE_VERSION that wrote them, so a reader never sees a
 * foreign schema. Version bumps switch the prefix (hard cut) and old entries
 * simply expire unused — there is no cross-generation tolerance to maintain.
 */
export interface StaleEnvelope<T> {
  d: T;
  e: number;
  t?: number;
  v: number;
}

export const ENVELOPE_VERSION = 1;

export function isEnvelope<T>(v: unknown): v is StaleEnvelope<T> {
  return (
    typeof v === "object" &&
    v !== null &&
    "d" in v &&
    "e" in v &&
    typeof (v as StaleEnvelope<T>).e === "number" &&
    typeof (v as StaleEnvelope<T>).v === "number"
  );
}
