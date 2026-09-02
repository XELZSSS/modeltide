import type { TextToImagePayload } from "@/shared/types/catalog";
import type { OpenSourceModelEntry, OpenRouterRankingsPayload } from "@/shared/types/rankings";

export type ThemeMode = "light" | "dark";

export interface HomeDashboardData {
  orRankings: OpenRouterRankingsPayload | null;
  opensource: OpenSourceModelEntry[] | null;
  textToImage: TextToImagePayload | null;
}

export type SearchResultSource =
  | "modelRankings"
  | "openRouterRankings"
  | "openSourceRankings"
  | "hallucinationRankings";

export interface SearchResult {
  id: string;
  name: string;
  source: SearchResultSource;
  score: number | null;
  provider: string | null;
  link: string;
}
