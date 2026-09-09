import type { SourceStatus } from "@/shared/types";
import type { TranslationKey } from "@/shared/i18n";
import type { NewsCategory } from "@/shared/types/news";

export const NEWS_CATEGORIES = [
  "industry",
  "opensource",
  "hardware",
  "funding",
  "research",
] as const satisfies readonly NewsCategory[];

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

export const SOURCE_IDS: readonly SourceStatus["id"][] = Object.keys(SOURCE_LABELS) as SourceStatus["id"][];
