export const RANKING_TABS = [
  "modelRankings",
  "openRouterRankings",
  "openSourceRankings",
  "hallucinationRankings",
  "benchmarkRankings",
  "arenaRankings",
  "providerCompare",
] as const;

export type RankingTabId = (typeof RANKING_TABS)[number];
