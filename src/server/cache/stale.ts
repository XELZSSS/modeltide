import { ONE_DAY, ONE_MINUTE } from "@/shared/config";

const STALE_WINDOW_MS = ONE_DAY;
const MAX_STALE_EXTRA_MS = 60 * ONE_MINUTE;

/**
 * A stale copy served while a detached refresh runs has to stay close to its own TTL: `maxStaleMs` allows up to 2 h
 * for a 30 min source, which would hand out very old data as a normal, non-partial response. Past this window the
 * request refreshes synchronously instead, so an upstream failure surfaces as `degraded` (partial) rather than as old
 * data pretending to be current.
 */
const SWR_STALE_EXTRA_MS = 60 * ONE_MINUTE;

/** `swr` = served while a detached refresh runs; `fallback` = the refresh already failed and this is the last resort. */
export type StaleBudget = "swr" | "fallback";

export interface StaleCandidate<T> {
  value: T;
  expiresAt: number;
  storedTtl: number;
  /** When the payload was produced (epoch ms); the ETag names it, and the body no longer carries it. */
  storedAt: number;
  /** The serialized body the candidate was stored with, when it has one. */
  body?: string;
}

/** How long past its TTL a stored copy may still be served. */
export function maxStaleMs(ttl: number): number {
  if (!Number.isFinite(ttl) || ttl <= 0) return MAX_STALE_EXTRA_MS;
  return Math.min(2 * ttl + MAX_STALE_EXTRA_MS, STALE_WINDOW_MS);
}

function staleLimitMs(storedTtl: number, budget: StaleBudget, capMs?: number): number {
  const base = budget === "swr" ? storedTtl + SWR_STALE_EXTRA_MS : maxStaleMs(storedTtl);
  return capMs == null ? base : Math.min(capMs, base);
}

/**
 * The freshest copy that is still inside its stale budget, or `undefined` when every candidate is too old.
 *
 * `capFor` answers the per-copy cap rather than taking one number for the whole call: a source whose *miss* must not be
 * pinned (the Hugging Face by-id lookup) still wants the full budget for the copies it found something in.
 */
export function pickFreshestStale<T>(
  candidates: readonly StaleCandidate<T>[],
  budget: StaleBudget,
  capFor?: (candidate: StaleCandidate<T>) => number | undefined,
): StaleCandidate<T> | undefined {
  const now = Date.now();
  let freshest: StaleCandidate<T> | undefined;
  for (const candidate of candidates) {
    if (now - candidate.expiresAt > staleLimitMs(candidate.storedTtl, budget, capFor?.(candidate))) continue;
    if (freshest === undefined || candidate.expiresAt > freshest.expiresAt) freshest = candidate;
  }
  return freshest;
}
