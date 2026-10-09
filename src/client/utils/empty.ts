import type { ArtificialAnalysisModel, DayBucket, SourceHistorySummary, StatusEvent } from "@/shared/types";

export const EMPTY_BUCKETS: DayBucket[] = [];
export const EMPTY_EVENTS: StatusEvent[] = [];
export const EMPTY_SOURCES: SourceHistorySummary[] = [];
export const EMPTY_MODELS: ArtificialAnalysisModel[] = [];
export function emptyArray<T>(): T[] {
  return [];
}
