import { ONE_DAY } from "@/shared/config/time";
import { CACHE_VERSION } from "@/shared/config/cache-version.gen";

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

export function applyApiHeaders(h: Headers): void {
  for (const [k, v] of Object.entries(CORS_HEADERS)) h.set(k, v);
  for (const [k, v] of Object.entries(API_SECURITY_HEADERS)) h.set(k, v);
  // The same content hash that cuts every derived KV key: a payload-shaping change moves both together.
  h.set(CONTRACT_VERSION_HEADER, CACHE_VERSION);
}
