import type { TextToImagePayload } from "./artificial";
import type { OpenSourceModelEntry } from "./huggingface";
import type { OpenRouterRankingsPayload } from "./openrouter";

/** UI color theme, persisted in localStorage. */
export type ThemeMode = "light" | "dark";

/** Combined data served for the home dashboard. */
export interface HomeDashboardData {
  orRankings: OpenRouterRankingsPayload | null;
  opensource: OpenSourceModelEntry[] | null;
  textToImage: TextToImagePayload | null;
}

/** The ranking tabs a search result can come from (each id doubles as its i18n label). */
export type SearchResultSource =
  | "modelRankings"
  | "openRouterRankings"
  | "openSourceRankings"
  | "hallucinationRankings";

/** A model match returned by cross-source search. */
export interface SearchResult {
  id: string;
  name: string;
  source: SearchResultSource;
  score: number | null;
  provider: string | null;
  link: string;
}

/** Health-check result for one upstream data source. */
export interface SourceStatus {
  id: "artificialAnalysis" | "huggingface" | "openrouter" | "news";
  ok: boolean;
  status: number | null;
  latencyMs: number | null;
  error: string | null;
  checkedAt: string;
}

/** Aggregate health-check payload across all sources; uptimeMs tracks service uptime since firstLaunchAt. */
export interface SourcesStatusPayload {
  sources: SourceStatus[];
  checkedAt: string;
  firstLaunchAt: string;
  uptimeMs: number;
}
