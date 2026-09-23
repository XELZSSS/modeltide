import { normalizeModelLimit } from "@/server/config/limits";
import { fnv1aHash } from "@/server/infra/hash";
import { cacheKey } from "@/shared/config/paths";
import type { NewsCategory } from "@/shared/types/news";

/** Caller-cardinality family: the L1 caps it so a walk over ids cannot evict shared payload keys. */
export const HIGH_CARDINALITY_KEY_MARKER = ":by-id:";

// Second hash over the same loop; both parts must stay bit-exact or every by-id cache entry is unreachable.
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
    // Always hashed: a raw id would share the key space with the hashed form, so a crafted `?id=`
    // could read another model's entry — or overwrite it with the `null` a 404 lookup caches.
    const trimmed = id.trim();
    return cacheKey("openSourceModels", "by-id", `h:${modelIdHash(trimmed)}`);
  },
  openSourceReleases: cacheKey("openSourceReleases"),
  news: (category: NewsCategory) => cacheKey("news", category),
  openRouterRankings: cacheKey("openRouterRankings"),
  openRouterPricing: cacheKey("openRouterRankings", "pricing-map", "per-million"),
  closedReleases: cacheKey("closedReleases"),
  agentRankings: cacheKey("agentRankings"),
  statusHistoryPayload: cacheKey("statusHistory", "payload"),
  textToImage: cacheKey("artificialIndex", "text-to-image"),
  changelog: cacheKey("artificialIndex", "changelog"),
} as const;
