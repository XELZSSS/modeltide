import { DEFAULT_TTL_MS, NEWS_TTL_MS, PARTIAL_FAIL_TTL_MS, ttlFor, ttlForCount } from "@/shared/config";

export const CachePolicy = {
  standard: { ttl: DEFAULT_TTL_MS, ttlFor },
  news: { ttl: NEWS_TTL_MS, ttlFor: ttlForCount },
  partial: { ttl: PARTIAL_FAIL_TTL_MS },
} as const;

export type CachePolicyName = keyof typeof CachePolicy;
