export const upstreamConfig = {
  artificialAnalysis: "https://artificialanalysis.ai",
  huggingface: "https://huggingface.co/api/models",
  openrouter: "https://openrouter.ai",
  arena: "https://arena.ai",
} as const satisfies Record<string, string>;

export const upstreamEndpoints = {
  aaLeaderboard: "/leaderboards/models",
  aaModels: "/models",
  aaOmniscience: "/evaluations/omniscience",
  aaTextToImage: "/image/models",
  agentBoard: "/leaderboard/agent",
  openRouterRankings: "/api/frontend/v1/rankings/models",
  openRouterDirectory: "/api/v1/models",
} as const;

export const MAX_JSON_BYTES = 5 * 1024 * 1024;
export const MAX_FEED_BYTES = 2 * 1024 * 1024;

export const USER_AGENT = "ModelTide/1.0 (+https://github.com/XELZSSS/modeltide)";

export function upstreamUrl(base: string, endpoint: string): string {
  return new URL(endpoint, base).href;
}
