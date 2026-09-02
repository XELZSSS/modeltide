import type { TranslationKey } from "@/shared/i18n";
import type { SearchResultSource, SourceStatus } from "@/shared/types";

// as-const storage keys; add new keys as literals so typos fail at the use site.
// NOTE: values are persisted in users' localStorage — never rename them.
export const STORAGE_KEYS = {
  settings: "settings",
  compare: "compare-store",
} as const;

export type ModelSource = "aa" | "or" | "os" | "hall";

/**
 * Central map from search-result source tabs to model-detail source ids.
 * Previously hardcoded at each useSearchAllRankings call site with no checking.
 */
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

export const SOURCE_LABELS: Record<SourceStatus["id"], TranslationKey> = {
  artificialAnalysis: "sourceNameArtificial",
  huggingface: "sourceNameHuggingFace",
  openrouter: "sourceNameOpenRouter",
  news: "sourceNameNews",
};

export const REPO_URL = "https://github.com/XELZSSS/aitiweta";
export const SOURCE_IDS = ["artificialAnalysis", "huggingface", "openrouter", "news"] as const;
