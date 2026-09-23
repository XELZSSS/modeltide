import type { TextToImageModel } from "@/shared/types/catalog";
import type { OpenRouterRankEntry, OpenSourceModelEntry } from "@/shared/types/rankings";

export type ThemeMode = "light" | "dark";

export type HomeOpenSourceEntry = Pick<OpenSourceModelEntry, "id" | "downloads" | "task">;

/** Carried inside one `SourcePayload`: each leg is plain rows, or null when that leg failed. */
export interface HomeDashboardData {
  orRankings: OpenRouterRankEntry[] | null;
  opensource: HomeOpenSourceEntry[] | null;
  textToImage: TextToImageModel[] | null;
}
