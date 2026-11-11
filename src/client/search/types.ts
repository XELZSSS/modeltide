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
  /** What `score` measures, as an i18n key: the number is not on one scale across sources — the AA list ranks by
   * `intelligence_index` (0-100), the hallucination list by `omniscienceIndex` (a signed index). */
  scoreLabel: TranslationKey | null;
  provider: string | null;
  link: string;
}
