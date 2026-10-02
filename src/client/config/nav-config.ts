import type { SearchResultSource } from "@/client/search/types";
import type { TranslationKey } from "@/shared/i18n";
import type { ModelSource } from "@/shared/types";

export type { ModelSource };

export const RANKING_TABS = [
  "modelRankings",
  "openRouterRankings",
  "openSourceRankings",
  "hallucinationRankings",
  "agentRankings",
  "providerCompare",
] as const;

export type RankingTabId = (typeof RANKING_TABS)[number];

export const DEFAULT_RANKING_TAB: RankingTabId = RANKING_TABS[0];

const RANKINGS_PATH = "/models";

function rankingTabHref(tab: RankingTabId): string {
  return `${RANKINGS_PATH}?tab=${tab}`;
}

export const SEARCH_SOURCE_TO_MODEL_SOURCE: Record<SearchResultSource, ModelSource> = {
  modelRankings: "aa",
  openRouterRankings: "or",
  openSourceRankings: "os",
  hallucinationRankings: "hall",
};

export const MODEL_SOURCES = {
  aa: {
    sourceLabelKey: "artificialSource" as const,
    backTo: rankingTabHref("modelRankings"),
    backLabelKey: "backToModelRankings" as const,
  },
  or: {
    sourceLabelKey: "openRouterSource" as const,
    backTo: rankingTabHref("openRouterRankings"),
    backLabelKey: "backToUsageRankings" as const,
  },
  os: {
    sourceLabelKey: "openSourceDataSource" as const,
    backTo: rankingTabHref("openSourceRankings"),
    backLabelKey: "backToOpenSourceRankings" as const,
  },
  hall: {
    sourceLabelKey: "hallucinationSource" as const,
    backTo: rankingTabHref("hallucinationRankings"),
    backLabelKey: "backToHallucinationRankings" as const,
  },
} as const satisfies Record<
  ModelSource,
  { sourceLabelKey: TranslationKey; backTo: string; backLabelKey: TranslationKey }
>;

export const RANKING_TAB_SOURCE_LABEL: Record<RankingTabId, TranslationKey> = {
  modelRankings: MODEL_SOURCES.aa.sourceLabelKey,
  openRouterRankings: MODEL_SOURCES.or.sourceLabelKey,
  openSourceRankings: MODEL_SOURCES.os.sourceLabelKey,
  hallucinationRankings: MODEL_SOURCES.hall.sourceLabelKey,
  agentRankings: "agentSource",
  providerCompare: MODEL_SOURCES.aa.sourceLabelKey,
};

export const REPO_URL = "https://github.com/XELZSSS/modeltide";
