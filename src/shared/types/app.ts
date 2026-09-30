import type { TextToImageModel } from "@/shared/types/catalog";
import type { OpenRouterRankEntry, OpenSourceModelEntry } from "@/shared/types/rankings";

export type ThemeMode = "light" | "dark";

export type HomeOpenSourceEntry = Pick<OpenSourceModelEntry, "id" | "downloads" | "task">;

export interface HomeDashboardData {
  orRankings: OpenRouterRankEntry[];
  opensource: HomeOpenSourceEntry[];
  textToImage: TextToImageModel[];
}
