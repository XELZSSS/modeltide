import { normalizeModelLimit } from "@/shared/config/limits";
import { cacheKey } from "@/shared/config/paths";
import { fnv1aHash, utf8ByteLength } from "@/shared/utils";
import type { NewsCategory } from "@/shared/types/news";

export const cacheKeys = {
  intelligenceIndex: cacheKey("artificialIndex"),
  homeDashboard: cacheKey("homeDashboard"),
  openSourceModels: (sort: string, direction: string, limit: number) =>
    cacheKey("openSourceModels", sort, direction, normalizeModelLimit(limit)),
  openSourceModel: (id: string) => {
    const trimmed = id.trim();
    // KV keys cap at 512 bytes; hash the rare oversized id instead of letting
    // every put for it throw (multi-byte ids can exceed the limit at 200 chars).
    const keyed = utf8ByteLength(trimmed) > 128 ? `h:${fnv1aHash(trimmed)}` : trimmed;
    return cacheKey("openSourceModels", "by-id", keyed);
  },
  openSourceReleases: cacheKey("openSourceReleases"),
  news: (category: NewsCategory) => cacheKey("news", category),
  openRouterRankings: cacheKey("openRouterRankings"),
  openRouterPricing: "openrouter-pricing-map:per-million",
  closedReleases: cacheKey("closedReleases"),
  agentRankings: cacheKey("agentRankings"),
  officialPricing: cacheKey("officialPricing"),
  statusHistoryPayload: cacheKey("statusHistory", "payload"),
  textToImage: "aa-text-to-image",
  changelog: "aa-changelog",
} as const;
