import type { TranslationKey } from "@/shared/i18n";
import type { ModelSource } from "@/shared/types";
import { SEARCH_SOURCE_TO_MODEL_SOURCE, SOURCES } from "./sources";

export type { ModelSource };
export { SEARCH_SOURCE_TO_MODEL_SOURCE };

export const RANKING_TABS = [
  "modelRankings",
  "openRouterRankings",
  "openSourceRankings",
  "hallucinationRankings",

  "providerCompare",
] as const;

export type RankingTabId = (typeof RANKING_TABS)[number];

export const DEFAULT_RANKING_TAB: RankingTabId = RANKING_TABS[0];

export const MODEL_SOURCES = {
  aa: {
    sourceLabelKey: SOURCES.aa.labelKey,
    backTo: SOURCES.aa.backTo,
    backLabelKey: SOURCES.aa.backLabelKey,
  },
  or: {
    sourceLabelKey: SOURCES.or.labelKey,
    backTo: SOURCES.or.backTo,
    backLabelKey: SOURCES.or.backLabelKey,
  },
  os: {
    sourceLabelKey: SOURCES.os.labelKey,
    backTo: SOURCES.os.backTo,
    backLabelKey: SOURCES.os.backLabelKey,
  },
  hall: {
    sourceLabelKey: SOURCES.hall.labelKey,
    backTo: SOURCES.hall.backTo,
    backLabelKey: SOURCES.hall.backLabelKey,
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

  providerCompare: MODEL_SOURCES.aa.sourceLabelKey,
};

export const REPO_URL = "https://github.com/XELZSSS/modeltide";
