import type { SearchResultSource } from "@/client/search/types";
import type { TranslationKey } from "@/shared/i18n";
import type { ModelSource } from "@/shared/types/app";

export interface SourceDecl {
  modelSource: ModelSource;
  searchSource: SearchResultSource;
  tabId: "modelRankings" | "openRouterRankings" | "openSourceRankings" | "hallucinationRankings";
  labelKey: TranslationKey;
  backTo: string;
  backLabelKey: TranslationKey;
}

const RANKINGS_PATH = "/models";

function rankingTabHref(tab: SourceDecl["tabId"]): string {
  return `${RANKINGS_PATH}?tab=${tab}`;
}

export const SOURCES: Record<ModelSource, SourceDecl> = {
  aa: {
    modelSource: "aa",
    searchSource: "modelRankings",
    tabId: "modelRankings",
    labelKey: "artificialSource",
    backTo: rankingTabHref("modelRankings"),
    backLabelKey: "backToModelRankings",
  },
  or: {
    modelSource: "or",
    searchSource: "openRouterRankings",
    tabId: "openRouterRankings",
    labelKey: "openRouterSource",
    backTo: rankingTabHref("openRouterRankings"),
    backLabelKey: "backToUsageRankings",
  },
  os: {
    modelSource: "os",
    searchSource: "openSourceRankings",
    tabId: "openSourceRankings",
    labelKey: "openSourceDataSource",
    backTo: rankingTabHref("openSourceRankings"),
    backLabelKey: "backToOpenSourceRankings",
  },
  hall: {
    modelSource: "hall",
    searchSource: "hallucinationRankings",
    tabId: "hallucinationRankings",
    labelKey: "hallucinationSource",
    backTo: rankingTabHref("hallucinationRankings"),
    backLabelKey: "backToHallucinationRankings",
  },
};

export const SEARCH_SOURCE_TO_MODEL_SOURCE: Record<SearchResultSource, ModelSource> = {
  modelRankings: "aa",
  openRouterRankings: "or",
  openSourceRankings: "os",
  hallucinationRankings: "hall",
};
