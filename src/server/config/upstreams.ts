import { upstreamConfig, upstreamEndpoints } from "@/server/config/upstream";
import { rssFeeds } from "@/server/sources/news-feeds";

export interface UpstreamDecl {
  id: string;
  base: string;
  endpoints: readonly string[];
  policy: "interactive" | "slowFeed" | "rsc";
}

export const UPSTREAMS: readonly UpstreamDecl[] = [
  {
    id: "artificialAnalysis",
    base: upstreamConfig.artificialAnalysis,
    endpoints: [upstreamEndpoints.aaLeaderboard, upstreamEndpoints.aaModels, upstreamEndpoints.aaOmniscience, upstreamEndpoints.aaTextToImage],
    policy: "rsc",
  },
  {
    id: "huggingface",
    base: upstreamConfig.huggingface,
    endpoints: [],
    policy: "interactive",
  },
  {
    id: "openrouter",
    base: upstreamConfig.openrouter,
    endpoints: [upstreamEndpoints.openRouterRankings, upstreamEndpoints.openRouterDirectory],
    policy: "interactive",
  },
  {
    id: "arena",
    base: upstreamConfig.arena,
    endpoints: [upstreamEndpoints.agentBoard],
    policy: "rsc",
  },
];

export interface FeedDecl {
  id: string;
  url: string;
  category: keyof typeof rssFeeds;
}

export const FEEDS: readonly FeedDecl[] = (Object.keys(rssFeeds) as (keyof typeof rssFeeds)[]).flatMap((category) =>
  rssFeeds[category].map((feed) => ({ ...feed, category })),
);
