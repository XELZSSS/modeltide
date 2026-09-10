import { ONE_DAY } from "@/shared/config/time";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Max-Age": String(ONE_DAY / 1000),
};

const BASE_SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
} as const;

const API_SECURITY_HEADERS: Record<string, string> = {
  ...BASE_SECURITY_HEADERS,
};

export function applyApiHeaders(h: Headers): void {
  for (const [k, v] of Object.entries(CORS_HEADERS)) h.set(k, v);
  for (const [k, v] of Object.entries(API_SECURITY_HEADERS)) h.set(k, v);
}
