import { CACHE_VERSION } from "@/shared/config/cache-version.gen.ts";

export const BROWSER_CACHE_HEADER = "public, max-age=60";
export const BROWSER_NO_STORE_HEADER = "no-store, max-age=0";
export const CDN_CACHE_HEADER = "public, max-age=300, stale-while-revalidate=300, stale-if-error=86400";
export const CDN_NO_STORE_HEADER = "no-store";

export const PARTIAL_CACHE_HEADERS = {
  browser: "public, max-age=30",
  cdn: "public, max-age=60, stale-while-revalidate=60, stale-if-error=86400",
};

const CONTRACT_VERSION_HEADER = "X-Contract-Version";

const WEAK_ETAG_PREFIX_RE = /^W\//;

export interface EtagVariant {
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
