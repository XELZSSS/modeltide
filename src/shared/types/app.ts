import type { TextToImageModel } from "./catalog";
import type { OpenRouterRankEntry, OpenSourceModelEntry } from "./rankings";

export type ThemeMode = "light" | "dark";

export type ModelSource = "aa" | "or" | "os" | "hall";

export type HomeOpenSourceEntry = Pick<OpenSourceModelEntry, "id" | "downloads" | "task">;

export interface HomeDashboardData {
  orRankings: OpenRouterRankEntry[];
  opensource: HomeOpenSourceEntry[];
  textToImage: TextToImageModel[];
}
