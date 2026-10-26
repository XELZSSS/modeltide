import type { TranslationKey } from "@/shared/i18n";

export type SearchResultSource = Extract<
  TranslationKey,
  "modelRankings" | "openRouterRankings" | "openSourceRankings" | "hallucinationRankings" | "decisionRankings"
>;

export interface SearchResult {
  id: string;
  name: string;
  source: SearchResultSource;
  score: number | null;
  /**
   * What `score` measures, as an i18n key, because the number is not on one scale across sources: the Artificial
   * Analysis list ranks by `intelligence_index` (0-100) and the hallucination list by `omniscienceIndex` (a signed index).
   * A result that shows a bare `score` has to be able to say which of the two it is.
   */
  scoreLabel: TranslationKey | null;
  provider: string | null;
  link: string;
}
