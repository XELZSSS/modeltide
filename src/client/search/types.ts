import type { TranslationKey } from "@/shared/i18n";

export type SearchResultSource = Extract<
  TranslationKey,
  "modelRankings" | "openRouterRankings" | "openSourceRankings" | "hallucinationRankings"
>;

export interface SearchResult {
  id: string;
  name: string;
  source: SearchResultSource;
  score: number | null;
  provider: string | null;
  link: string;
}
