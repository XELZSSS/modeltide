import type { TextToImageModel } from "./catalog";
import type { OpenRouterRankEntry, OpenSourceModelEntry } from "./rankings";

export type ThemeMode = "system" | "light" | "dark";

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
  /**
   * The model creator's name, not a model name — the other home lists use `name` for a model. `null` means the creator
   * is unknown and the client substitutes a translated label; an empty string is never sent.
   */
  name: string | null;
  /** A creator's brand colour, or a CSS custom property (`var(--text-tertiary)`) when the creator has none. */
  color: string;
  avgSpeed: number;
}

export interface HomeHallucinationPoint {
  /** The model's display name (the same value as `ArtificialAnalysisModel.name`). */
  name: string;
  accuracy: number;
}

/** One slice of the home page's open-source task histogram, aggregated on the server. */
export interface TaskSlice {
  key: string;
  total: number;
}

export interface HomeDashboardData {
  orRankings: OpenRouterRankEntry[];
  opensource: HomeOpenSourceEntry[];
  /** The full HF page's task histogram, so the client never needs the thousand rows behind it. */
  openSourceTasks: TaskSlice[];
  textToImage: TextToImageModel[];
  chart: HomeChartPoint[];
  providers: HomeProviderSpeed[];
  hallucinations: HomeHallucinationPoint[];
}
