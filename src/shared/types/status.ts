export type SourceId =
  | "artificialAnalysis"
  | "huggingface"
  | "openrouter"
  | "newsTechCrunch"
  | "newsArsTechnica"
  | "newsMitTechReview"
  | "newsVerge"
  | "newsGoogleAi"
  | "newsQbitai"
  | "newsHfBlog"
  | "newsPytorch"
  | "newsSimonWillison"
  | "newsOllama"
  | "newsTomsHardware"
  | "newsNvidia"
  | "newsServeTheHome"
  | "newsCrunchbase"
  | "newsTechCrunchVenture"
  | "newsGoogleResearch"
  | "newsBair"
  | "newsMitNewsAi"
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
  status: number | null;
  error: string | null;
  warn: boolean;
  warnReason: string | null;
}

export interface StatusEvent {
  id: SourceId;
  type: "down" | "up" | "degraded";
  at: string;
  durationMin: number | null;
  detail: string | null;
}

export interface SourceHistorySummary {
  id: SourceId;
  ok: boolean;
  level: SourceHealthLevel;
  latencyMs: number | null;
  checkedAt: string | null;
  detail: string | null;
}

export interface StatusHistoryPayload {
  firstLaunchAt: string;
  uptimeMs: number;
  sources: SourceHistorySummary[];
  recent: Partial<Record<SourceId, UptimeSample[]>>;
  events: StatusEvent[];
  storeMode: StatusStoreMode;
}

export interface SourceIncidentUpdate {
  body: string;
  status: string;
  createdAt: string | null;
}

export interface SourceIncident {
  id: string;
  name: string;
  status: string;
  impact: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  shortlink: string | null;
  updates: SourceIncidentUpdate[];
}

export interface SourceIncidentLog {
  source: SourceId;
  pageUrl: string | null;
  incidents: SourceIncident[];
}
