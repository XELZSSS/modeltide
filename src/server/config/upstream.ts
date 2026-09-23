export const upstreamConfig = {
  artificialAnalysis: "https://artificialanalysis.ai",
  huggingface: "https://huggingface.co/api/models",
  huggingfaceSite: "https://huggingface.co",
  openrouter: "https://openrouter.ai",
  arena: "https://arena.ai",
} as const satisfies Record<string, string>;

export const upstreamEndpoints = {
  aaIndex: "/evaluations/artificial-analysis-intelligence-index",
  aaModels: "/models",
  aaOmniscience: "/evaluations/omniscience",
  aaTextToImage: "/image/models",
  aaChangelog: "/changelog",
  agentBoard: "/leaderboard/agent",
  openRouterRankings: "/api/frontend/v1/rankings/models",
  openRouterDirectory: "/api/v1/models",
  hfDailyPapers: "/api/daily_papers",
} as const;

export const providerStatusEndpoints = {
  openaiApi: "https://status.openai.com/api/v2/summary.json",
  anthropicApi: "https://status.claude.com/api/v2/summary.json",
  googleCloudApi: "https://status.cloud.google.com/incidents.json",
  groqApi: "https://groqstatus.com/api/v2/summary.json",
  cohereApi: "https://status.cohere.com/api/v2/summary.json",
  fireworksApi: "https://status.fireworks.ai/api/v2/summary.json",
  cerebrasApi: "https://status.cerebras.ai/api/v2/summary.json",
  deepseekApi: "https://deepseek.statuspage.io/api/v2/summary.json",
  moonshotApi: "https://status.moonshot.cn/api/v2/summary.json",
} as const;

export const MAX_JSON_BYTES = 5 * 1024 * 1024;
export const MAX_FEED_BYTES = 2 * 1024 * 1024;

export const USER_AGENT = "ModelTide/1.0 (+https://github.com/XELZSSS/modeltide)";

/** Endpoints are absolute, so they resolve against the origin: a base carrying a path prefix would drop it. */
export function upstreamUrl(base: string, endpoint: string): string {
  return new URL(endpoint, base).href;
}
