import type { SearchResultSource, SourceStatus } from "@/shared/types";
import type { TranslationKey } from "@/shared/i18n";

export const BENCHMARK_KEYS = [
  "aime25",
  "gpqa",
  "hle",
  "mmlu_pro",
  "livecodebench",
  "gdpval",
  "scicode",
  "ifbench",
  "lcr",
  "tau2",
  "tau_banking",
  "terminalbench_v2_1",
  "terminalbench_hard",
  "critpt",
  "apex_agents",
  "omniscience",
] as const;

export type BenchmarkKey = (typeof BENCHMARK_KEYS)[number];

export const BENCHMARK_LABELS: Record<BenchmarkKey, TranslationKey> = {
  aime25: "benchmarkAime25",
  gpqa: "benchmarkGpqa",
  hle: "benchmarkHle",
  mmlu_pro: "benchmarkMmluPro",
  livecodebench: "benchmarkLivecodebench",
  gdpval: "benchmarkGdpval",
  scicode: "benchmarkScicode",
  ifbench: "benchmarkIfbench",
  lcr: "benchmarkLcr",
  tau2: "benchmarkTau2",
  tau_banking: "benchmarkTauBanking",
  terminalbench_v2_1: "benchmarkTerminalbenchV2_1",
  terminalbench_hard: "benchmarkTerminalbenchHard",
  critpt: "benchmarkCritpt",
  apex_agents: "benchmarkApexAgents",
  omniscience: "benchmarkOmniscience",
};

export const STORAGE_KEYS = {
  settings: "settings",
  compare: "compare-store",
} as const;

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

export const SOURCE_LABELS: Record<SourceStatus["id"], TranslationKey> = {
  artificialAnalysis: "sourceNameArtificial",
  huggingface: "sourceNameHuggingFace",
  openrouter: "sourceNameOpenRouter",
  news: "sourceNameNews",
  arena: "sourceNameArena",
  openaiApi: "sourceNameOpenAIApi",
  anthropicApi: "sourceNameAnthropicApi",
  googleCloudApi: "sourceNameGoogleCloudApi",
  groqApi: "sourceNameGroqApi",
  cohereApi: "sourceNameCohereApi",
  fireworksApi: "sourceNameFireworksApi",
  cerebrasApi: "sourceNameCerebrasApi",
  deepseekApi: "sourceNameDeepSeekApi",
  moonshotApi: "sourceNameMoonshotApi",
};

export const ARENA_BOARD_CATEGORIES = {
  coding: { labelKey: "arenaCatCoding" },
  math: { labelKey: "arenaCatMath" },
  "creative-writing": { labelKey: "arenaCatCreative" },
  "instruction-following": { labelKey: "arenaCatInstruction" },
  "hard-prompts": { labelKey: "arenaCatHard" },
} as const satisfies Record<string, { labelKey: TranslationKey }>;

export type ArenaBoardKey = keyof typeof ARENA_BOARD_CATEGORIES;
export const ARENA_BOARD_IDS = Object.keys(ARENA_BOARD_CATEGORIES) as ArenaBoardKey[];

export const REPO_URL = "https://github.com/XELZSSS/modeltide";
export const SOURCE_IDS: readonly SourceStatus["id"][] = Object.keys(SOURCE_LABELS) as SourceStatus["id"][];
