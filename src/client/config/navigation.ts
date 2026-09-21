import type { SearchResultSource } from "@/shared/types";
import type { TranslationKey } from "@/shared/i18n";

export const RANKING_TABS = [
  "modelRankings",
  "openRouterRankings",
  "openSourceRankings",
  "hallucinationRankings",
  "agentRankings",
  "providerCompare",
] as const;

export type RankingTabId = (typeof RANKING_TABS)[number];

export type ModelSource = "aa" | "or" | "os" | "hall";

export const SEARCH_SOURCE_TO_MODEL_SOURCE: Record<SearchResultSource, ModelSource> = {
  modelRankings: "aa",
  openRouterRankings: "or",
  openSourceRankings: "os",
  hallucinationRankings: "hall",
};

export const MODEL_SOURCES = {
  aa: {
    sourceLabelKey: "artificialSource" as const,
    backTo: "/models?tab=modelRankings" as const,
    backLabelKey: "backToModelRankings" as const,
  },
  or: {
    sourceLabelKey: "openRouterSource" as const,
    backTo: "/models?tab=openRouterRankings" as const,
    backLabelKey: "backToUsageRankings" as const,
  },
  os: {
    sourceLabelKey: "openSourceDataSource" as const,
    backTo: "/models?tab=openSourceRankings" as const,
    backLabelKey: "backToOpenSourceRankings" as const,
  },
  hall: {
    sourceLabelKey: "hallucinationSource" as const,
    backTo: "/models?tab=hallucinationRankings" as const,
    backLabelKey: "backToHallucinationRankings" as const,
  },
} as const satisfies Record<
  ModelSource,
  { sourceLabelKey: TranslationKey; backTo: string; backLabelKey: TranslationKey }
>;

export const REPO_URL = "https://github.com/XELZSSS/modeltide";
