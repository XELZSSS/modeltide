import type { TranslationKey } from "@/shared/i18n";
import type { SourceStatus } from "@/shared/types";

export const STORAGE_KEYS = {
  // Legacy single-purpose keys, superseded by the merged `settings` store; kept
  // only so a rollback to an older deployed client still finds its data.
  lang: "lang",
  theme: "theme",
  settings: "settings",
  compare: "compare-store",
} as const satisfies Record<string, string>;

export type ModelSource = "aa" | "or" | "os" | "hall";

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
