import type { DayBucket, UptimeSample } from "@/shared/types";
import type { SourceStatus } from "@/shared/types";
import { ONE_MINUTE, ONE_DAY } from "@/shared/config";

/**
 * Rolling history of probe samples for every data source, persisted in a single KV
 * key and appended by the cron scheduler (~1 write per tick — well inside KV's
 * 1 write/second-per-key limit). Two co-located windows:
 *  - recent: raw samples for the last 24h (latency chart, event timeline)
 *  - daily:  per-UTC-day rollups for the last 90 days (uptime percentages)
 */

export const HISTORY_KEY = "status:history:v1";
export const SAMPLE_INTERVAL_MS = 4 * ONE_MINUTE;
export const RECENT_WINDOW_MS = ONE_DAY;
export const RETAINED_DAYS = 90;
export const MAX_EVENTS = 50;
// Outlives one sampling round (~seconds) but expires well before the next tick,
// so a crashed sampler cannot wedge the store permanently.
export const SAMPLE_LOCK_TTL_S = 120;

export type SourceId = SourceStatus["id"];

export interface HistorySourceEntry {
  recent: UptimeSample[];
  daily: DayBucket[];
}

export interface HistoryStore {
  sources: Partial<Record<SourceId, HistorySourceEntry>>;
}

export const emptyEntry = (): HistorySourceEntry => ({ recent: [], daily: [] });

export const utcDay = (t: number): string => new Date(t).toISOString().slice(0, 10);
