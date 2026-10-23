// Cache and contract-version headers only. Do not add security headers (CSP, X-Frame-Options, HSTS, …): Cloudflare
// Pages owns the edge policy and the repo-side set was removed on purpose. See AGENTS.md before touching this file.

import { CACHE_VERSION } from "@/shared/config/cache-version.gen.ts";

export const BROWSER_CACHE_HEADER = "public, max-age=60";
export const BROWSER_NO_STORE_HEADER = "no-store, max-age=0";
export const CDN_CACHE_HEADER = "public, max-age=300, stale-while-revalidate=300, stale-if-error=86400";
export const CDN_NO_STORE_HEADER = "no-store";
export const PARTIAL_CACHE_HEADERS = {
  browser: "public, max-age=30",
  cdn: "public, max-age=60, stale-while-revalidate=60, stale-if-error=86400",
};


/**
 * Browsers cache an API response for at most half of the server's TTL, and the CDN layer keeps it for the full
 * window: the origin refreshes at the same cadence, so an edge hit never hands out data older than one refresh
 * cycle. Both are capped so a change to a long-TTL source (releases, open-source lists) still reaches every
 * reader within half an hour instead of the full server TTL.
 */
const MAX_TTL_HEADER_S = 30 * 60;
const FALLBACK_TTL_HEADER_S = 60;

export function cacheHeadersForTtl(ttlMs: number): { browser: string; cdn: string } {
  const source = Number.isFinite(ttlMs) && ttlMs > 0 ? Math.floor(ttlMs / 1000) : FALLBACK_TTL_HEADER_S;
  const cdn = Math.min(source, MAX_TTL_HEADER_S);
  const browser = Math.max(30, Math.floor(cdn / 2));
  const swr = Math.min(cdn, 300);
  return {
    browser: `public, max-age=${browser}`,
    cdn: `public, max-age=${cdn}, stale-while-revalidate=${swr}, stale-if-error=86400`,
  };
}

const CONTRACT_VERSION_HEADER = "X-Contract-Version";

const WEAK_ETAG_PREFIX_RE = /^W\//;

interface EtagVariant {
  rows?: number;
  partial?: boolean;
}

export function payloadEtag(fetchedAt: string, variant: EtagVariant = {}): string {
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
 * Advertises the build id the client compares against its own to detect a stale bundle.
 */
export function applyApiHeaders(h: Headers): void {
  h.set(CONTRACT_VERSION_HEADER, CACHE_VERSION);
}
