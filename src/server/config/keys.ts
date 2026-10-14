import { fnv1aHash } from "@/server/infra/hash";
import { cacheKey } from "@/shared/config/paths";
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
  homeOpenSource: (sort: string, direction: string) => cacheKey("homeDashboard", "opensource", sort, direction),
  openSourceModels: (sort: string, direction: string) => cacheKey("openSourceModels", sort, direction),

  openSourceModel: (id: string) => {
    const trimmed = id.trim();
    return cacheKey("openSourceModel", "by-id", `h:${modelIdHash(trimmed)}`);
  },
  news: (category: NewsCategory) => cacheKey("news", category),
  openRouterRankings: cacheKey("openRouterRankings"),
  openRouterPricing: cacheKey("openRouterRankings", "pricing-map", "per-million"),
  closedReleases: cacheKey("closedReleases"),

  textToImage: cacheKey("artificialIndex", "text-to-image"),
} as const;
