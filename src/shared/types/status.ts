/** Probed upstream source id; also the key of `SOURCE_LABELS`. */
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

export type SourceLevel = "ok" | "warn" | "error";
export type SourceHealthLevel = SourceLevel | "unknown";

export interface UptimeSample {
  t: number;
  ok: boolean;
  latencyMs: number | null;
  status?: number | null;
  /** Failure detail (probe error, or "x/y endpoints failed: …") on down samples. */
  error?: string | null;
  warn?: boolean;
  /** What the provider page actually reports; absent on healthy samples. */
  warnReason?: string | null;
}

export interface DayBucket {
  day: string;
  total: number;
  ok: number;
  /** Degraded samples also count in `ok`, so this is the only record of the day's degradation. */
  warn?: number;
}

export interface StatusEvent {
  id: SourceId;
  type: "down" | "up" | "degraded";
  at: string;
  durationMin: number | null;
  /** Probe failure detail for `down`, the provider's own degradation warning for `degraded`; null for
   * `up`, absent in payloads cached before it existed. */
  detail?: string | null;
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
  /** Share of the last 24h's samples that were degraded but up; kept out of `uptime24h`. */
  degraded24h: number | null;
  avgLatency24h: number | null;
  detail?: string | null;
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
