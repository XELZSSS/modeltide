import { fnv1aHash } from "@/server/util/hash";
import { cacheKey } from "@/shared/config/api";
import type { NewsCategory } from "@/shared/types/news";

const SECOND_HASH_BASIS = 2166136261 ^ 0x9e3779b9;
const SECOND_HASH_PRIME = 2246822519;

function modelIdHash(raw: string): string {
  return `${fnv1aHash(raw)}-${fnv1aHash(raw, SECOND_HASH_BASIS, SECOND_HASH_PRIME)}`;
}

/**
 * Every entry is built through `cacheKey(domain, …)`, so its first segment is a `ApiDomain` by construction: the link
 * this table has to the domain list is the function signature, not a second hand-maintained mapping.
 */
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
  decisionIndex: cacheKey("decisionIndex"),

  // `artificialIndex` names the Artificial Analysis data family, not one page: the image leaderboard is another page of
  // the same upstream, so it lives under this prefix with its own segment. The index payload itself is the suffixless
  // key above, so the two can never collide.
  textToImage: cacheKey("artificialIndex", "text-to-image"),
} as const;
