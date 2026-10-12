import {
  DEFAULT_TTL_MS,
  NEWS_TTL_MS,
  SLOW_TTL_MS,
  STATIC_TTL_MS,
} from "@/shared/config/time";
import type { ApiDomain } from "@/shared/config/paths";
import { cacheKeys } from "@/server/config/keys";
import type { FetchPolicyName } from "@/server/config/fetch-policies";

export interface SourceCatalogEntry {
  ttl: number;
  fetchPolicy: FetchPolicyName;
  cacheKeySample: string;
  staleCapMs?: number;
  memoryOnly?: boolean;
}

export const SOURCE_CATALOG: Record<ApiDomain, SourceCatalogEntry> = {
  artificialIndex: { ttl: DEFAULT_TTL_MS, fetchPolicy: "rsc", cacheKeySample: cacheKeys.intelligenceIndex },
  homeDashboard: { ttl: 5 * 60_000, fetchPolicy: "interactive", cacheKeySample: cacheKeys.homeDashboard },
  news: { ttl: NEWS_TTL_MS, fetchPolicy: "slowFeed", cacheKeySample: cacheKeys.news("industry") },
  agentRankings: { ttl: SLOW_TTL_MS, fetchPolicy: "rsc", cacheKeySample: cacheKeys.agentRankings },
  openSourceModels: { ttl: SLOW_TTL_MS, fetchPolicy: "interactive", cacheKeySample: "openSourceModels:*" },
  closedReleases: { ttl: STATIC_TTL_MS, fetchPolicy: "rsc", cacheKeySample: cacheKeys.closedReleases },
  openSourceModel: {
    ttl: SLOW_TTL_MS,
    fetchPolicy: "interactive",
    cacheKeySample: "openSourceModel:by-id:*",
    memoryOnly: true,
    staleCapMs: 5 * 60_000,
  },
  openRouterRankings: { ttl: DEFAULT_TTL_MS, fetchPolicy: "interactive", cacheKeySample: cacheKeys.openRouterRankings },
};
