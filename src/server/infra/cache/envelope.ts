import { ONE_DAY } from "@/shared/config";

const STALE_WINDOW_MS = ONE_DAY;
const MAX_STALE_EXTRA_MS = 60 * 60_000;

export function maxStaleMs(ttl: number): number {
  if (!Number.isFinite(ttl) || ttl <= 0) return MAX_STALE_EXTRA_MS;
  return Math.min(2 * ttl + MAX_STALE_EXTRA_MS, STALE_WINDOW_MS);
}

export interface StaleEnvelope<T> {
  d: T;
  e: number;
  t?: number;
}

export function isEnvelope<T>(v: unknown): v is StaleEnvelope<T> {
  if (typeof v !== "object" || v === null || !("d" in v) || !("e" in v)) return false;
  const e = (v as StaleEnvelope<T>).e;
  return typeof e === "number" && Number.isFinite(e);
}
