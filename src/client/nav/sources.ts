import type { SearchResultSource } from "@/client/search/types";
import type { TranslationKey } from "@/shared/i18n";
import type { ModelSource } from "@/shared/types/app";
import { PATHS, TAB_PARAM, VIEW_PARAM } from "@/client/router/paths";

type RankTabId =
  | "modelRankings"
  | "openRouterRankings"
  | "openSourceRankings"
  | "hallucinationRankings"
  | "decisionRankings";

interface SourceDecl {
  labelKey: TranslationKey;
  backTo: string;
  backLabelKey: TranslationKey;
}

/** A rankings-tab link. `view` opens one of that tab's sub-views; the AA tab keeps its rankings/pricing mode there. */
export function rankingTabHref(tab: RankTabId, view?: string): string {
  const params = new URLSearchParams({ [TAB_PARAM]: tab });
  if (view !== undefined) params.set(VIEW_PARAM, view);
  return `${PATHS.rankings}?${params.toString()}`;
}

export const SOURCES: Record<ModelSource, SourceDecl> = {
  aa: {
    labelKey: "artificialSource",
    backTo: rankingTabHref("modelRankings"),
    backLabelKey: "backToModelRankings",
  },
  or: {
    labelKey: "openRouterSource",
    backTo: rankingTabHref("openRouterRankings"),
    backLabelKey: "backToUsageRankings",
  },
  os: {
    labelKey: "openSourceDataSource",
    backTo: rankingTabHref("openSourceRankings"),
    backLabelKey: "backToOpenSourceRankings",
  },
  hall: {
    labelKey: "hallucinationSource",
    backTo: rankingTabHref("hallucinationRankings"),
    backLabelKey: "backToHallucinationRankings",
  },
  decision: {
    labelKey: "decisionSource",
    backTo: rankingTabHref("decisionRankings"),
    backLabelKey: "backToDecisionRankings",
  },
};

export const SEARCH_SOURCE_TO_MODEL_SOURCE: Record<SearchResultSource, ModelSource> = {
  modelRankings: "aa",
  openRouterRankings: "or",
  openSourceRankings: "os",
  hallucinationRankings: "hall",
  decisionRankings: "decision",
};
