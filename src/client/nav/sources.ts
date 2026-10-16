import type { SearchResultSource } from "@/client/search/types";
import type { TranslationKey } from "@/shared/i18n";
import type { ModelSource } from "@/shared/types/app";

type RankTabId = "modelRankings" | "openRouterRankings" | "openSourceRankings" | "hallucinationRankings";

interface SourceDecl {
  labelKey: TranslationKey;
  backTo: string;
  backLabelKey: TranslationKey;
}

const RANKINGS_PATH = "/models";

function rankingTabHref(tab: RankTabId): string {
  return `${RANKINGS_PATH}?tab=${tab}`;
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
};

export const SEARCH_SOURCE_TO_MODEL_SOURCE: Record<SearchResultSource, ModelSource> = {
  modelRankings: "aa",
  openRouterRankings: "or",
  openSourceRankings: "os",
  hallucinationRankings: "hall",
};
