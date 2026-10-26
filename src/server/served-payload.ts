import type { SourcePayload } from "@/shared/types";

/**
 * A payload together with what the router needs to answer with it, kept as one value instead of two module-level
 * symbols attached to the payload object.
 *
 * The cache computes `body` once, when it stores an entry, and `producedAt` is when that payload was produced. Both
 * used to travel as non-enumerable symbol properties on the payload itself (`serialized-body.ts` and
 * `payload-time.ts`), which made the route→cache hand-off a convention nothing checked: a source that composed its
 * value into another payload had to re-attach the stamp by hand, and a payload built by a test handler simply carried
 * none.
 *
 * Here the three fields are a plain, spreadable shape. `body` stays absent (not `""`) when the cache did not store one,
 * so "encode this payload yourself" is the only reading a missing body has, and `producedAt` stays optional because a
 * payload the cache never produced genuinely has no stamp.
 */
export interface ServedPayload<T> {
  readonly payload: SourcePayload<T>;
  /** The exact bytes the response body is served from, when the cache stored this payload with one. */
  readonly body?: string;
  /** When this payload was produced (epoch ms) — the ETag's basis. */
  readonly producedAt?: number;
}

/**
 * Wraps a payload for the router. `producedAt` is omitted rather than defaulted: a caller that has no stamp passes
 * nothing, and the router decides what a missing stamp means (a fresh ETag that costs a 304, never a body).
 */
export function served<T>(payload: SourcePayload<T>, opts?: { body?: string; producedAt?: number }): ServedPayload<T> {
  return {
    payload,
    ...(opts?.body === undefined ? {} : { body: opts.body }),
    ...(opts?.producedAt === undefined ? {} : { producedAt: opts.producedAt }),
  };
}

/**
 * The same payload with `partial: true` and no body — the shape a stale fallback has to be served as.
 *
 * A stale copy stored beside a `partial: false` body cannot be served from those bytes: the flag, the ETag and the cache
 * headers would all disagree with the body's own `partial`, the client would never show the partial notice and its
 * partial-poll would never start. The router re-encodes this payload instead, which is why it carries no `body`.
 */
export function degraded<T>(payload: SourcePayload<T>, producedAt: number | undefined): ServedPayload<T> {
  return served({ ...payload, partial: true }, { producedAt });
}
