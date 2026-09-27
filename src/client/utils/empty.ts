import type { ArtificialAnalysisModel, DayBucket, SourceHistorySummary, StatusEvent } from "@/shared/types";

export const EMPTY_SAMPLES: { t: number; latencyMs: number | null }[] = [];
export const EMPTY_BUCKETS: DayBucket[] = [];
export const EMPTY_EVENTS: StatusEvent[] = [];
export const EMPTY_SOURCES: SourceHistorySummary[] = [];
export const EMPTY_MODELS: ArtificialAnalysisModel[] = [];
export const EMPTY_ARRAY: never[] = [];
