import type { TextToImageModel } from "@/shared/types/catalog";
import type { OpenSourceModelEntry, OpenRouterRankingsPayload } from "@/shared/types/rankings";
import type { SourcePayload } from "@/shared/types/payload";

export type ThemeMode = "light" | "dark";

/**
 * Open-source row as the home dashboard ships it: the trending bars read the id
 * and the download count, the task donut reads the pipeline task. Every other
 * column is paid for on every app load and read by nobody.
 */
export type HomeOpenSourceEntry = Pick<OpenSourceModelEntry, "id" | "downloads" | "task">;

export interface HomeDashboardData {
  orRankings: OpenRouterRankingsPayload | null;
  opensource: SourcePayload<HomeOpenSourceEntry[]> | null;
  textToImage: SourcePayload<TextToImageModel[]> | null;
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
