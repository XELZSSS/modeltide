import { fnv1aHash } from "@/server/util/hash";
import { cacheKey } from "@/shared/config/api";
import type { NewsCategory } from "@/shared/types/news";

const SECOND_HASH_BASIS = 2166136261 ^ 0x9e3779b9;
const SECOND_HASH_PRIME = 2246822519;

function modelIdHash(raw: string): string {
  return `${fnv1aHash(raw)}-${fnv1aHash(raw, SECOND_HASH_BASIS, SECOND_HASH_PRIME)}`;
}

export const cacheKeys = {
  intelligenceIndex: cacheKey("artificialIndex"),
  aaLeaderboardBody: cacheKey("artificialIndex", "leaderboard-body"),
  aaModelsEnrich: cacheKey("artificialIndex", "models-enrich"),
  aaOmniscienceEnrich: cacheKey("artificialIndex", "omniscience-enrich"),
  homeDashboard: cacheKey("homeDashboard"),
  openSourceModels: (sort: string) => cacheKey("openSourceModels", sort),

  openSourceModel: (id: string) => cacheKey("openSourceModels", "by-id", `h:${modelIdHash(id.trim())}`),
  news: (category: NewsCategory) => cacheKey("news", category),
  openRouterRankings: cacheKey("openRouterRankings"),
  openRouterPricing: cacheKey("openRouterRankings", "pricing-map", "per-million"),
  closedReleases: cacheKey("closedReleases"),

  textToImage: cacheKey("artificialIndex", "text-to-image"),
} as const;
