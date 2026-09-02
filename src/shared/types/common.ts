import type { TextToImagePayload } from "./artificial";
import type { OpenSourceModelEntry } from "./huggingface";
import type { OpenRouterRankingsPayload } from "./openrouter";

/** UI color theme, persisted in localStorage. */
export type ThemeMode = "light" | "dark";

/** Combined data served for the home dashboard. */
export interface HomeDashboardData {
  /**
   * OpenRouter rankings, or null when that source failed (NOT [] — null means
   * "fetch failed", so the UI can show degraded state instead of "0 models").
   */
  orRankings: OpenRouterRankingsPayload | null;
  /**
   * HuggingFace open-source list, or null when that source failed. An empty []
   * from upstream is treated as transient failure server-side (partial TTL);
   * home.ts settles each source to null on rejection, so null = failed.
   */
  opensource: OpenSourceModelEntry[] | null;
  /**
   * Text-to-Image payload, or null when that source failed. Distinguish from
   * `{ models: [] }` (ambiguous empty): prefer null for failure; when a payload
   * object exists check `partial === true` / isEmptyT2i() for degraded empties.
   */
  textToImage: TextToImagePayload | null;
}

/** Which home-dashboard slices are missing (partial degradation descriptor). */
export interface HomePartial {
  partial: boolean;
  missing: (keyof HomeDashboardData)[];
}

/** True when the T2I payload is absent or carries no models (null-safe). */
export function isEmptyT2i(payload: TextToImagePayload | null | undefined): boolean {
  return !payload || !Array.isArray(payload.models) || payload.models.length === 0;
}

/** Describe which HomeDashboardData slices failed (all-null => full failure). */
export function describeHomePartial(data: HomeDashboardData): HomePartial {
  const missing = (Object.keys(data) as (keyof HomeDashboardData)[]).filter((k) => data[k] == null);
  return { partial: missing.length > 0, missing };
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
