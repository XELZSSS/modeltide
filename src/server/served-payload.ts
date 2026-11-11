import type { SourcePayload } from "@/shared/types";

/**
 * A payload together with what the router needs to answer with it, kept as one spreadable value. `body` is the bytes the
 * cache computed when it stored the entry and `producedAt` is when that payload was produced (the ETag's basis); `body`
 * stays absent (not `""`) when the cache stored none, and `producedAt` is optional because an unstamped payload genuinely
 * has no time.
 */
export interface ServedPayload<T> {
  readonly payload: SourcePayload<T>;
  /** The exact bytes the response body is served from, when the cache stored this payload with one. */
  readonly body?: string;
  /** When this payload was produced (epoch ms) — the ETag's basis. */
  readonly producedAt?: number;
}

/** Wraps a payload for the router; `producedAt` is omitted rather than defaulted, and the router decides what a missing stamp means. */
export function served<T>(payload: SourcePayload<T>, opts?: { body?: string; producedAt?: number }): ServedPayload<T> {
  return {
    payload,
    ...(opts?.body === undefined ? {} : { body: opts.body }),
    ...(opts?.producedAt === undefined ? {} : { producedAt: opts.producedAt }),
  };
}

/** The same payload with `partial: true` and no body — the shape a stale fallback has to be served as: a stale copy stored beside a `partial: false` body cannot be served from those bytes, since the flag, the ETag and the cache headers would all disagree. */
export function degraded<T>(payload: SourcePayload<T>, producedAt: number | undefined): ServedPayload<T> {
  return served({ ...payload, partial: true }, { producedAt });
}
