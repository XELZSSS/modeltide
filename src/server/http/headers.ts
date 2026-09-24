import { ONE_DAY } from "@/shared/config/time";
import { CACHE_VERSION } from "@/shared/config/cache-version.gen";

export const BROWSER_CACHE_HEADER = "public, max-age=60";
export const BROWSER_NO_STORE_HEADER = "no-store, max-age=0";
export const CDN_CACHE_HEADER = "public, max-age=300, stale-while-revalidate=300, stale-if-error=86400";
export const CDN_NO_STORE_HEADER = "no-store";

export const PARTIAL_CACHE_HEADERS = {
  browser: "public, max-age=30",
  cdn: "public, max-age=60, stale-while-revalidate=60",
};

const CONTRACT_VERSION_HEADER = "X-Contract-Version";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Expose-Headers": CONTRACT_VERSION_HEADER,
  "Access-Control-Max-Age": String(ONE_DAY / 1000),
};

const BASE_SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
} as const;

const API_SECURITY_HEADERS: Record<string, string> = {
  ...BASE_SECURITY_HEADERS,
  "Referrer-Policy": "no-referrer",
  "X-Frame-Options": "DENY",
};

export function payloadEtag(fetchedAt: string): string {
  return `W/"${CACHE_VERSION}-${fetchedAt}"`;
}

export function ifNoneMatchSatisfied(ifNoneMatch: string | null, etag: string): boolean {
  if (!ifNoneMatch) return false;
  const target = etag.replace(/^W\//, "");
  return ifNoneMatch.split(",").some((candidate) => {
    const tag = candidate.trim();
    return tag === "*" || tag.replace(/^W\//, "") === target;
  });
}

export function applyApiHeaders(h: Headers): void {
  for (const [k, v] of Object.entries(CORS_HEADERS)) h.set(k, v);
  for (const [k, v] of Object.entries(API_SECURITY_HEADERS)) h.set(k, v);
  h.set(CONTRACT_VERSION_HEADER, CACHE_VERSION);
}
