/** Stable identifier of a probed upstream source; also the key of `SOURCE_LABELS`. */
export type SourceId =
  | "artificialAnalysis"
  | "huggingface"
  | "openrouter"
  | "news"
  | "arena"
  | "openaiApi"
  | "anthropicApi"
  | "googleCloudApi"
  | "groqApi"
  | "cohereApi"
  | "fireworksApi"
  | "cerebrasApi"
  | "deepseekApi"
  | "moonshotApi";

/** Decisive health verdict: fully working (ok), degraded but up (warn), or failing (error). */
export type SourceLevel = "ok" | "warn" | "error";
/** SourceLevel plus the "never probed" state shown as grey in the UI. */
export type SourceHealthLevel = SourceLevel | "unknown";

export interface UptimeSample {
  t: number;
  ok: boolean;
  latencyMs: number | null;
  status?: number | null;
  error?: string | null;
  /** True when the source is up but degraded (provider page reports a minor incident). */
  warn?: boolean;
}

export interface DayBucket {
  day: string;
  total: number;
  ok: number;
}

export interface StatusEvent {
  id: SourceId;
  type: "down" | "up" | "degraded";
  at: string;
  durationMin: number | null;
}

export interface SourceHistorySummary {
  id: SourceId;
  ok: boolean;
  /** Tri-level health derived server-side; absent in payloads cached before it existed. */
  level?: SourceHealthLevel;
  latencyMs: number | null;
  checkedAt: string | null;
  uptime24h: number | null;
  uptime7d: number | null;
  avgLatency24h: number | null;
}

export interface StatusHistoryPayload {
  firstLaunchAt: string;
  uptimeMs: number;
  sources: SourceHistorySummary[];
  recent: Partial<Record<SourceId, UptimeSample[]>>;
  daily: Partial<Record<SourceId, DayBucket[]>>;
  events: StatusEvent[];
  persisted: boolean;
}
