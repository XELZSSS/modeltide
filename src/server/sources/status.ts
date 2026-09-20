// Barrel preserving the historic `@/server/sources/status` import path.
// New code should import from the split modules under `./status/*` directly.
export {
  SAMPLE_UPSERT_WINDOW_MS,
  RECENT_WINDOW_MS,
  RETAINED_DAYS,
  emptyEntry,
  utcDay,
  uptimeRatio,
  avgLatency,
  deriveEvents,
  mergeSample,
  buildSourceSummary,
  type SourceId,
  type HistorySourceEntry,
  type HistoryStore,
} from "./status/history-math";
export { getUptime, type UptimePayload } from "./status/uptime";
export {
  buildTargets,
  probeTargets,
  aggregateProbes,
  type ProbeTarget,
  type SourceAggregate,
} from "./status/probe";
export {
  HISTORY_KEY,
  SAMPLE_LOCK_KEY,
  readStore,
  recordStatusSamples,
  ensureFreshSamples,
  latestSampleAt,
} from "./status/store";
export { buildHistoryPayload } from "./status/payload";
