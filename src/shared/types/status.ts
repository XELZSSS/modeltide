export interface SourceStatus {
  id:
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
  ok: boolean;
  status: number | null;
  latencyMs: number | null;
  error: string | null;
  checkedAt: string;
}

export interface UptimeSample {
  t: number;
  ok: boolean;
  latencyMs: number | null;
  status?: number | null;
  error?: string | null;
}

export interface DayBucket {
  day: string;
  total: number;
  ok: number;
}

export interface StatusEvent {
  id: SourceStatus["id"];
  type: "down" | "up";
  at: string;
  durationMin: number | null;
}

export interface SourceHistorySummary {
  id: SourceStatus["id"];
  ok: boolean;
  latencyMs: number | null;
  checkedAt: string | null;
  uptime24h: number | null;
  uptime7d: number | null;
  uptime30d: number | null;
  avgLatency24h: number | null;
}

export interface StatusHistoryPayload {
  firstLaunchAt: string;
  uptimeMs: number;
  sources: SourceHistorySummary[];
  recent: Partial<Record<SourceStatus["id"], UptimeSample[]>>;
  daily: Partial<Record<SourceStatus["id"], DayBucket[]>>;
  events: StatusEvent[];
  generatedAt: string;
  persisted: boolean;
}
