import type { TextToImageModel } from "./catalog";
import type { OpenRouterRankEntry, OpenSourceModelEntry } from "./rankings";

export type ThemeMode = "light" | "dark";

export type ModelSource = "aa" | "or" | "os" | "hall";

export type HomeOpenSourceEntry = Pick<OpenSourceModelEntry, "id" | "downloads" | "task">;

/** Top-N slice of the Artificial Analysis index, pre-aggregated for the home page. */
export interface HomeChartPoint {
  id: string;
  name: string;
  shortName: string | null;
  intelligence: number;
  coding: number;
}

export interface HomeProviderSpeed {
  name: string;
  color: string;
  avgSpeed: number;
}

export interface HomeHallucinationPoint {
  model: string;
  accuracy: number;
}

export interface HomeDashboardData {
  orRankings: OpenRouterRankEntry[];
  opensource: HomeOpenSourceEntry[];
  textToImage: TextToImageModel[];
  chart: HomeChartPoint[];
  providers: HomeProviderSpeed[];
  hallucinations: HomeHallucinationPoint[];
}
