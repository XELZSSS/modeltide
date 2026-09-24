import { normalizeModelLimit } from "@/server/config/limits";
import { fnv1aHash } from "@/server/infra/hash";
import { cacheKey } from "@/shared/config/paths";
import type { NewsCategory } from "@/shared/types/news";

export const HIGH_CARDINALITY_KEY_MARKER = ":by-id:";

const SECOND_HASH_BASIS = 2166136261 ^ 0x9e3779b9;
const SECOND_HASH_PRIME = 2246822519;

function modelIdHash(raw: string): string {
  return `${fnv1aHash(raw)}-${fnv1aHash(raw, SECOND_HASH_BASIS, SECOND_HASH_PRIME)}`;
}

export const cacheKeys = {
  intelligenceIndex: cacheKey("artificialIndex"),
  aaIndexBody: cacheKey("artificialIndex", "body"),
  aaModelsEnrich: cacheKey("artificialIndex", "models-enrich"),
  aaOmniscienceEnrich: cacheKey("artificialIndex", "omniscience-enrich"),
  homeDashboard: cacheKey("homeDashboard"),
  openSourceModels: (sort: string, direction: string, limit: number) =>
    cacheKey("openSourceModels", sort, direction, normalizeModelLimit(limit)),
  openSourceModel: (id: string) => {
    const trimmed = id.trim();
    return cacheKey("openSourceModels", "by-id", `h:${modelIdHash(trimmed)}`);
  },
  news: (category: NewsCategory) => cacheKey("news", category),
  openRouterRankings: cacheKey("openRouterRankings"),
  openRouterPricing: cacheKey("openRouterRankings", "pricing-map", "per-million"),
  closedReleases: cacheKey("closedReleases"),
  agentRankings: cacheKey("agentRankings"),
  statusHistoryPayload: cacheKey("statusHistory", "payload"),
  textToImage: cacheKey("artificialIndex", "text-to-image"),
  changelog: cacheKey("artificialIndex", "changelog"),
} as const;
