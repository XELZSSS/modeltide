import type { TextToImageModel } from "./catalog.ts";
import type { OpenSourceModelEntry } from "./rankings.ts";

export type ThemeMode = "system" | "light" | "dark";

/**
 * The theme modes as a value, not only a type: `index.html` resolves the stored preference before the SPA boots, and
 * `settings-store` accepts a persisted value, so both carry their own copy of this enum. `consistency-guard` compares
 * the html against this list — a new mode that only reached the store would flash the OS preference on first paint.
 */
export const THEME_MODES = ["system", "light", "dark"] as const;

export type ModelSource = "aa" | "or" | "os" | "hall" | "decision";

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
  /** A creator's dot colour as `hsl(…)`, produced by `providerDotColor`; a brand colour without a usable hue still
   * yields one, so this is never a CSS custom property. */
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
  opensource: HomeOpenSourceEntry[];
  /** The full HF page's task histogram, so the client never needs the thousand rows behind it. */
  openSourceTasks: TaskSlice[];
  textToImage: TextToImageModel[];
  chart: HomeChartPoint[];
  providers: HomeProviderSpeed[];
  hallucinations: HomeHallucinationPoint[];
}
