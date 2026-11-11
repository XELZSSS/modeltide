import type { CodingAgentEntry, OpenSourceModelEntry } from "./rankings.ts";

export type ThemeMode = "system" | "light" | "dark";

/**
 * The theme modes as a value, not only a type: `index.html` resolves the stored preference before the SPA boots,
 * `settings-store` accepts a persisted value, and `consistency-guard` compares the html against this list.
 */
export const THEME_MODES = ["system", "light", "dark"] as const;

export type ModelSource = "aa" | "or" | "os" | "hall" | "decision";

export type HomeOpenSourceEntry = Pick<OpenSourceModelEntry, "id" | "downloads" | "task">;

/**
 * Top-N slice of AA's intelligence index for the home overview chart; one 0-100 score per row, so one bar per model.
 */
export interface HomeChartPoint {
  id: string;
  name: string;
  /** AA's intelligence index, 0-100. */
  score: number;
}

export interface HomeProviderSpeed {
  /**
   * The model creator's name, not a model name — the other home lists use `name` for a model. `null` means the creator
   * is unknown and the client substitutes a translated label; an empty string is never sent.
   */
  name: string | null;
  /** A creator's dot colour as `hsl(...)` from `providerDotColor`; never a CSS custom property. */
  color: string;
  avgSpeed: number;
}

export interface HomeHallucinationPoint {
  name: string;
  accuracy: number;
}

/** One OpenRouter usage row, pre-sliced: the card prints the model and the tokens it moved. */
export interface HomeUsagePoint {
  id: string;
  name: string;
  totalTokens: number;
}

/** One Decision Index row, pre-sliced: the composite is 0-100, the same scale the tab's table prints. */
export interface HomeDecisionPoint {
  id: string;
  name: string;
  index: number;
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
  codingAgents: CodingAgentEntry[];
  intelligence: HomeChartPoint[];
  coding: HomeChartPoint[];
  usage: HomeUsagePoint[];
  decision: HomeDecisionPoint[];
  providers: HomeProviderSpeed[];
  hallucinations: HomeHallucinationPoint[];
}
