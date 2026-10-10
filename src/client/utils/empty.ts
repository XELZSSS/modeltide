import type { ArtificialAnalysisModel, SourceHistorySummary, StatusEvent } from "@/shared/types";

export const EMPTY_EVENTS: StatusEvent[] = [];
export const EMPTY_SOURCES: SourceHistorySummary[] = [];
export const EMPTY_MODELS: ArtificialAnalysisModel[] = [];
export function emptyArray<T>(): T[] {
  return [];
}
