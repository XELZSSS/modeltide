import { ONE_DAY } from "@/shared/config";

export const STALE_WINDOW_MS = ONE_DAY;
export const MAX_STALE_EXTRA_MS = 60 * 60_000;

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
  return typeof v === "object" && v !== null && "d" in v && "e" in v && typeof (v as StaleEnvelope<T>).e === "number";
}

export function staleOrThrow<T>(mem: { d: T; e: number } | undefined, ttl: number): T {
  if (!mem) throw new Error("cache miss with no stale fallback");
  if (Date.now() - mem.e > maxStaleMs(ttl)) throw new Error("stale budget exceeded");
  return mem.d;
}
