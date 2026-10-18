export const upstreamConfig = {
  artificialAnalysis: "https://artificialanalysis.ai",
  huggingface: "https://huggingface.co/api/models",
  openrouter: "https://openrouter.ai",
} as const satisfies Record<string, string>;

export const upstreamEndpoints = {
  aaLeaderboard: "/leaderboards/models",
  aaModels: "/models",
  aaOmniscience: "/evaluations/omniscience",
  aaTextToImage: "/image/models",
  openRouterRankings: "/api/frontend/v1/rankings/models",

  openRouterDirectory: "/api/v1/models",
} as const;

export { MAX_FEED_BYTES, MAX_JSON_BYTES } from "@/server/formats/limits";

export const USER_AGENT = "ModelTide/1.0 (+https://github.com/XELZSSS/modeltide)";

export function upstreamUrl(base: string, endpoint: string): string {
  return new URL(endpoint, base).href;
}
