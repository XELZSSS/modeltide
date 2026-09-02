import type { SourceStatus } from "./common";

/** One probe result for a data source, taken by the cron scheduler (~4 min cadence). */
export interface UptimeSample {
  /** Epoch millis of the sample. */
  t: number;
  ok: boolean;
  /** Successful probe round-trip in millis; null when the probe failed. */
  latencyMs: number | null;
  /** HTTP status of the winning (successful) probe; null on failure or for older samples. */
  status?: number | null;
  /** Aggregated failure reason when the whole source is down; null when healthy or unknown. */
  error?: string | null;
}

/** Per-day rollup of samples for one data source (UTC days). */
export interface DayBucket {
  /** UTC day in "YYYY-MM-DD" form. */
  day: string;
  total: number;
  ok: number;
  latencySum: number;
  latencyN: number;
  /** ok → fail transitions observed that day. */
  incidents: number;
}

/** A derived availability state transition (failures and recoveries). */
export interface StatusEvent {
  id: SourceStatus["id"];
  type: "down" | "up";
  /** ISO timestamp of the sample that flipped the state. */
  at: string;
  /** For "down" events: minutes the outage lasted when it recovered (null while ongoing). */
  durationMin: number | null;
}

/** Per-source rollup served on the status page list. */
export interface SourceHistorySummary {
  id: SourceStatus["id"];
  ok: boolean;
  latencyMs: number | null;
  checkedAt: string | null;
  /** Uptime ratios in [0,1]; null when no samples exist in the window. */
  uptime24h: number | null;
  uptime7d: number | null;
  uptime90d: number | null;
  /** Average successful-probe latency over 24h in millis; null when no samples. */
  avgLatency24h: number | null;
}

export interface StatusHistoryPayload {
  /** Time since the worker's first recorded launch (see sources/uptime.ts). */
  firstLaunchAt: string;
  uptimeMs: number;
  sources: SourceHistorySummary[];
  /** Raw 24h samples per source id, oldest first. */
  recent: Partial<Record<SourceStatus["id"], UptimeSample[]>>;
  /** 90 daily buckets per source id, oldest first. */
  daily: Partial<Record<SourceStatus["id"], DayBucket[]>>;
  /** State transitions derived from recent samples, newest first. */
  events: StatusEvent[];
  generatedAt: string;
}
