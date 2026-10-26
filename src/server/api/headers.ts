// Cache and contract-version headers only. Do not add security headers (CSP, X-Frame-Options, HSTS, …): Cloudflare
// Pages owns the edge policy and the repo-side set was removed on purpose. See AGENTS.md before touching this file.

import { CONTRACT_VERSION } from "@/shared/config/cache-version.gen.ts";

export const BROWSER_NO_STORE_HEADER = "no-store, max-age=0";
export const CDN_NO_STORE_HEADER = "no-store";

/** Rendered cache policy: what the reader's browser keeps, and what the edge keeps. */
export interface CacheSpec {
  browser: string;
  cdn: string;
}

/**
 * The durations a `CacheSpec` renders from. Kept apart from the rendered strings because a `partial` payload is
 * re-rendered from the numbers with shorter windows; building it out of the rendered header instead would lose the
 * stale-if-error decision, which belongs to the route rather than to one answer.
 */
export interface CacheDurations {
  browserMaxAgeS: number;
  cdnMaxAgeS: number;
  /** Upper bound for `stale-while-revalidate`; the window that gets rendered is the smaller of this and `cdnMaxAgeS`. */
  swrCapS: number;
  /** Omitted when the edge must not serve this response after the origin failed. */
  staleIfErrorS?: number;
}

const STALE_IF_ERROR_S = 86_400;
const MAX_TTL_HEADER_S = 30 * 60;
const FALLBACK_TTL_HEADER_S = 60;
const BROWSER_MIN_MAX_AGE_S = 30;
const BROWSER_TTL_DIVISOR = 2;
const SWR_HEADER_CAP_S = 300;

/**
 * The shortest windows the API hands out: what `renderPartialCacheSpec` clamps a degraded payload to. Exported so a
 * route that must never be pinned at the edge — the Hugging Face by-id miss — reuses these numbers instead of
 * restating them, and the two can only move together.
 *
 * `staleIfErrorS` is deliberately absent: this is a route-level duration set whose whole point is that the edge may
 * not serve the answer after the origin failed.
 */
export const SHORTEST_CACHE_DURATIONS: CacheDurations = {
  browserMaxAgeS: 30,
  cdnMaxAgeS: 60,
  swrCapS: 60,
};

/**
 * Browsers keep an API response for half the server's TTL (floored at 30 s so a short-TTL source is not re-asked on
 * every navigation); the CDN keeps it for the full window, so an edge hit never hands out data older than one refresh
 * cycle. Both are capped so a change to a long-TTL source still reaches every reader within half an hour.
 */
export function cacheDurationsForTtl(ttlMs: number): CacheDurations {
  const source = Number.isFinite(ttlMs) && ttlMs > 0 ? Math.floor(ttlMs / 1000) : FALLBACK_TTL_HEADER_S;
  const cdnMaxAgeS = Math.min(source, MAX_TTL_HEADER_S);
  return {
    browserMaxAgeS: Math.max(BROWSER_MIN_MAX_AGE_S, Math.floor(cdnMaxAgeS / BROWSER_TTL_DIVISOR)),
    cdnMaxAgeS,
    swrCapS: SWR_HEADER_CAP_S,
    staleIfErrorS: STALE_IF_ERROR_S,
  };
}

export function renderCacheSpec(durations: CacheDurations): CacheSpec {
  // The window is the smaller of the freshness window and the cap: a `stale-while-revalidate` that outlives `max-age`
  // would be a contradictory header, so the cap is what keeps the two consistent by construction.
  const swr = Math.min(durations.cdnMaxAgeS, durations.swrCapS);
  const staleIfError = durations.staleIfErrorS === undefined ? "" : `, stale-if-error=${durations.staleIfErrorS}`;
  return {
    browser: `public, max-age=${durations.browserMaxAgeS}`,
    cdn: `public, max-age=${durations.cdnMaxAgeS}, stale-while-revalidate=${swr}${staleIfError}`,
  };
}

/**
 * The same policy with both freshness windows tightened, so a payload the origin could only partly refresh is re-asked
 * on the next visit. `staleIfErrorS` carries over untouched: whether this route's responses may outlive an origin
 * failure is a property of the route, not of this answer — adding it here handed the edge a day-long `stale-if-error`
 * for the Hugging Face by-id miss, whose point is precisely not to be pinned.
 */
export function renderPartialCacheSpec(durations: CacheDurations): CacheSpec {
  return renderCacheSpec({
    ...durations,
    browserMaxAgeS: Math.min(durations.browserMaxAgeS, SHORTEST_CACHE_DURATIONS.browserMaxAgeS),
    cdnMaxAgeS: Math.min(durations.cdnMaxAgeS, SHORTEST_CACHE_DURATIONS.cdnMaxAgeS),
    swrCapS: Math.min(durations.swrCapS, SHORTEST_CACHE_DURATIONS.swrCapS),
  });
}

const CONTRACT_VERSION_HEADER = "X-Contract-Version";

const WEAK_ETAG_PREFIX_RE = /^W\//;

interface EtagVariant {
  rows?: number;
  partial?: boolean;
}

export function payloadEtag(fetchedAt: string, variant: EtagVariant): string {
  const rows = variant.rows === undefined ? "" : `-${variant.rows}`;
  const partial = variant.partial === true ? "-p" : "";
  return `W/"${fetchedAt}${rows}${partial}"`;
}

export function ifNoneMatchSatisfied(ifNoneMatch: string | null, etag: string): boolean {
  if (!ifNoneMatch) return false;
  const target = etag.replace(WEAK_ETAG_PREFIX_RE, "");
  return ifNoneMatch.split(",").some((candidate) => {
    const tag = candidate.trim();
    return tag === "*" || tag.replace(WEAK_ETAG_PREFIX_RE, "") === target;
  });
}

/**
 * Advertises the payload contract version — the hash of the wire types, the domain → payload map and the domain paths,
 * which is what the client compares against to detect a stale bundle. Deliberately not the cache version, so a
 * server-side change that leaves the payload shape alone does not report skew to every reader.
 */
export function applyApiHeaders(h: Headers): void {
  h.set(CONTRACT_VERSION_HEADER, CONTRACT_VERSION);
}
