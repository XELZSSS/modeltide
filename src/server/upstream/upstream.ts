import { SITE_URLS } from "@/shared/config/sites";

export const upstreamConfig = {
  artificialAnalysis: SITE_URLS.artificialAnalysis,
  huggingface: `${SITE_URLS.huggingface}/api/models`,
  openrouter: SITE_URLS.openRouter,
} as const satisfies Record<string, string>;

export const upstreamEndpoints = {
  aaLeaderboard: "/leaderboards/models",
  aaModels: "/models",
  aaOmniscience: "/evaluations/omniscience",
  aaTextToImage: "/image/models",
  openRouterRankings: "/api/frontend/v1/rankings/models",

  openRouterDirectory: "/api/v1/models",
} as const;

export { MAX_FEED_BYTES, MAX_JSON_BYTES, MAX_RSC_BYTES } from "@/server/formats/limits";

export const USER_AGENT = `ModelTide/1.0 (+${SITE_URLS.repository})`;

export function upstreamUrl(base: string, endpoint: string): string {
  return new URL(endpoint, base).href;
}
