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

export type StatusStoreMode = "kv" | "memory";

export interface UptimeSample {
  t: number;
  ok: boolean;
  latencyMs: number | null;
  status?: number | null;
  error?: string | null;
  warn?: boolean;
  warnReason?: string | null;
}

export interface DayBucket {
  day: string;
  total: number;
  ok: number;
  warn?: number;
}

export interface StatusEvent {
  id: SourceId;
  type: "down" | "up" | "degraded";
  at: string;
  durationMin: number | null;
  detail?: string | null;
}

export interface SourceHistorySummary {
  id: SourceId;
  ok: boolean;
  level?: SourceHealthLevel;
  latencyMs: number | null;
  checkedAt: string | null;
  uptime24h: number | null;
  uptime7d: number | null;
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
  storeMode?: StatusStoreMode;
}
