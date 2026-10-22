import { ONE_DAY } from "@/shared/config/time";
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

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Expose-Headers": CONTRACT_VERSION_HEADER,
  "Access-Control-Max-Age": String(ONE_DAY / 1000),
};

const WEAK_ETAG_PREFIX_RE = /^W\//;
const CORS_ENTRIES = Object.entries(CORS_HEADERS);

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

export function applyApiHeaders(h: Headers): void {
  for (const [k, v] of CORS_ENTRIES) h.set(k, v);
  h.set(CONTRACT_VERSION_HEADER, CACHE_VERSION);
}
