import type { SourceId } from "@/shared/types";
import type { TranslationKey } from "@/shared/i18n";
import type { NewsCategory } from "@/shared/types/news";

export const NEWS_CATEGORIES = [
  "industry",
  "opensource",
  "hardware",
  "funding",
  "research",
] as const satisfies readonly NewsCategory[];

export const SOURCE_LABELS: Record<SourceId, TranslationKey> = {
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

export const SOURCE_IDS: readonly SourceId[] = Object.keys(SOURCE_LABELS) as SourceId[];

/**
 * Label key for a source id, or undefined when the id is unknown — a payload
 * cached before a deploy can carry a source that has since been renamed away.
 * Callers fall back to rendering the raw id.
 */
export function sourceLabelKey(id: string): TranslationKey | undefined {
  return Object.hasOwn(SOURCE_LABELS, id) ? SOURCE_LABELS[id as SourceId] : undefined;
}
