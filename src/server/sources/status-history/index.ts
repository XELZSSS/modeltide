// Re-export all public API from the split modules
export type { HistoryStore, SourceId, HistorySourceEntry } from "./types";
export { HISTORY_KEY, SAMPLE_INTERVAL_MS, RECENT_WINDOW_MS, RETAINED_DAYS, MAX_EVENTS, SAMPLE_LOCK_TTL_S } from "./types";
export { mergeSample } from "./merge";
export { deriveEvents } from "./events";
export { buildHistoryPayload } from "./payload";
export { uptimeRatio, avgLatency } from "./utils";
export {
  recordStatusSamples,
  mergeSamplesIntoStore,
  ensureFreshSamples,
  getStatusHistory,
  statusFromStore,
  readStore,
} from "./store";
