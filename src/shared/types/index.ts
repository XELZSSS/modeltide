import type { BenchmarkKey } from "@/shared/config";

// Ranking-domain types. Field names mirror the Artificial Analysis API (snake_case).

/** Creator/vendor metadata. */
export interface ModelCreators {
  name?: string;
  color?: string;
}

/** Per-1M-token prices in USD. */
export interface ModelPricing {
  input?: number | null;
  output?: number | null;
  /** Snake-case upstream field; prefer the `cacheHit` alias below. */
  cache_hit?: number | null;
  /**
   * Camel-case alias of `cache_hit`. Writers may set either; readers must
   * accept both (`pricing.cacheHit ?? pricing.cache_hit`).
   */
  cacheHit?: number | null;
}

/** Output speed in tokens per second. */
export interface ModelSpeed {
  median_output_speed?: number | null;
}

/** Cost breakdown in USD. */
export interface ModelCost {
  total?: number | null;
  input?: number | null;
  output?: number | null;
  reasoning?: number | null;
}

/** Omniscience sub-scores: accuracy, attempt rate, and hallucination rate. */
export interface ModelOmniscienceBreakdown {
  total?: {
    accuracy?: number | null;
    attempt_rate?: number | null;
    hallucination_rate?: number | null;
    omniscience?: number | null;
  };
}

/** A single model entry from the Artificial Analysis intelligence index. */
export interface ArtificialAnalysisModel {
  /** App-wide identity, never "" — callers must treat "" as absent. */
  id: string;
  slug: string;
  name: string;
  short_name?: string | null;
  model_creators?: ModelCreators;
  intelligence_index: number | null;
  is_reasoning?: boolean;
  release_date?: string | null;
  is_open_weights?: boolean;
  context_window_tokens?: number | null;
  blended_price?: number | null;
  cost?: ModelCost;
  coding_index?: number | null;
  agentic_index?: number | null;
  /**
   * Canonical keys are BenchmarkKey; the string index keeps forward-compat
   * for unknown upstream keys. Values are 0-100 points.
   */
  benchmarks?: Partial<Record<BenchmarkKey, number | null>> & Record<string, number | null>;
  pricing?: ModelPricing;
  speed?: ModelSpeed;
  input_modality_text?: boolean;
  input_modality_image?: boolean;
  input_modality_speech?: boolean;
  input_modality_video?: boolean;
  output_modality_text?: boolean;
  output_modality_image?: boolean;
  output_modality_speech?: boolean;
  output_modality_video?: boolean;
  omniscience_breakdown?: ModelOmniscienceBreakdown;
}

/** Text-to-Image leaderboard entry from Artificial Analysis. */
export interface TextToImageModel {
  id: string;
  slug: string;
  name: string;
  rank: number;
  elo: number | null;
  eloLower: number | null;
  eloUpper: number | null;
  appearances: number | null;
  winRate: number | null;
  pricePer1kImages: number | null;
  creatorName: string | null;
}

/** Payload for the Text-to-Image leaderboard. */
export interface TextToImagePayload {
  /** Ranked models. Empty is ambiguous upstream — see `partial`; use isEmptyT2i(). */
  models: TextToImageModel[];
  /** True when this payload is a degraded/empty fallback. */
  partial?: boolean;
  /** ISO fetch time. */
  fetchedAt?: string;
}

/** Usage-based ranking categories from OpenRouter. */
export type OpenRouterCategory = "coding" | "reasoning" | "general";

/** A model row in the OpenRouter usage rankings. */
export interface OpenRouterRankEntry {
  rank: number;
  id: string;
  name: string;
  creator: string;
  category: OpenRouterCategory;
  variant?: string;
  totalTokens?: number;
  promptTokens?: number;
  completionTokens?: number;
  reasoningTokens?: number;
  requestCount?: number;
  imageOutputRequests?: number;
  videoOutputSeconds?: number;
  change?: number | null;
  pricing?: {
    prompt: number;
    completion: number;
    input_cache_read?: number;
  };
  isFree?: boolean;
}

/** Wrapper for the OpenRouter usage-rankings response. */
export interface OpenRouterRankingsPayload {
  tokenUsageRankings: OpenRouterRankEntry[];
  fetchedAt: string;
}

/** A model from the Hugging Face Hub open-source leaderboard. */
export interface OpenSourceModelEntry {
  id: string;
  /** Author org/user; null when unknown. */
  author: string | null;
  downloads: number;
  likes: number;
  /** License id; null when unrecognized. */
  license: string | null;
  task: string | null;
  createdAt: string | null;
  lastModified: string | null;
  tags: string[];
}

/** One row of the Arena human-preference leaderboard. */
export interface ArenaRankEntry {
  rank: number;
  id: string;
  name: string;
  creator: string;
  /** Arena Elo-style score. */
  score: number | null;
  votes: number | null;
  /** True when Arena flags the row as Preliminary (too few votes). */
  preliminary: boolean;
  priceInput: number | null;
  priceOutput: number | null;
  contextTokens: number | null;
}

/** Wrapper for the Arena human-preference rankings response. */
export interface ArenaRankingsPayload {
  entries: ArenaRankEntry[];
  fetchedAt: string;
}

/** One Arena capability slice (coding / math / ...) backing the benchmark tab. */
export interface ArenaBoardPayload {
  category: string;
  entries: ArenaRankEntry[];
  fetchedAt: string;
}

/** One closed-source frontier release. */
export interface ClosedReleaseEntry {
  id: string;
  model: string;
  provider: string;
  /** ISO date (YYYY-MM-DD) as published upstream. */
  releaseDate: string;
  /** Blurb; empty when the entry carries none. */
  notes: string;
  /** Model page URL; null when absent. */
  link: string | null;
}

/** One officially priced model (first-party rate, USD per 1M tokens). */
export interface OfficialPriceModel {
  id: string;
  name: string;
  provider: string;
  input: number | null;
  cachedInput: number | null;
  output: number | null;
  contextWindow: number | null;
}

/** Wrapper for the official first-party pricing dataset response. */
export interface OfficialPricingPayload {
  models: OfficialPriceModel[];
  updatedAt: string | null;
  fetchedAt: string;
}

/** A model row in the hallucination-rate ranking derived from AA Omniscience scores. */
export interface HallucinationRankingEntry {
  id: string;
  slug: string;
  model: string;
  hallucinationRate: number | null;
  accuracy: number | null;
  attemptRate: number | null;
  omniscienceIndex: number;
}

// Service-domain types: home/search/health + news + status history.

/** UI color theme, persisted in localStorage. */
export type ThemeMode = "light" | "dark";

/** Combined data served for the home dashboard (null = source failed). */
export interface HomeDashboardData {
  orRankings: OpenRouterRankingsPayload | null;
  opensource: OpenSourceModelEntry[] | null;
  textToImage: TextToImagePayload | null;
}

/** True when the T2I payload is absent or carries no models (null-safe). */
export function isEmptyT2i(payload: TextToImagePayload | null | undefined): boolean {
  return !payload || !Array.isArray(payload.models) || payload.models.length === 0;
}

/** The ranking tabs a search result can come from. */
export type SearchResultSource =
  | "modelRankings"
  | "openRouterRankings"
  | "openSourceRankings"
  | "hallucinationRankings";

/** A model match returned by cross-source search. */
export interface SearchResult {
  id: string;
  name: string;
  source: SearchResultSource;
  score: number | null;
  provider: string | null;
  link: string;
}

/** Health-check result for one upstream data source. */
export interface SourceStatus {
  id: "artificialAnalysis" | "huggingface" | "openrouter" | "news" | "arena" | "benchmarkList";
  ok: boolean;
  status: number | null;
  latencyMs: number | null;
  error: string | null;
  checkedAt: string;
}

/** News feed categories. */
export type NewsCategory = "industry" | "opensource" | "hardware" | "funding";

/** A single article parsed from an RSS feed. */
export interface NewsItem {
  id: string;
  title: string;
  link: string;
  pubDate: string;
  source: string;
}

/** One probe result for a data source. */
export interface UptimeSample {
  /** Epoch millis. */
  t: number;
  ok: boolean;
  /** Probe round-trip millis; null on failure. */
  latencyMs: number | null;
  /** HTTP status of the winning probe; null on failure. */
  status?: number | null;
  /** Failure reason; null when healthy. */
  error?: string | null;
}

/** Per-day rollup of samples for one data source (UTC days). */
export interface DayBucket {
  /** UTC day "YYYY-MM-DD". */
  day: string;
  total: number;
  ok: number;
  latencySum: number;
  latencyN: number;
  /** ok → fail transitions that day. */
  incidents: number;
}

/** An availability state transition. */
export interface StatusEvent {
  id: SourceStatus["id"];
  type: "down" | "up";
  /** ISO timestamp of the flipping sample. */
  at: string;
  /** Outage minutes once recovered; null while ongoing. */
  durationMin: number | null;
}

/** Per-source rollup for the status page list. */
export interface SourceHistorySummary {
  id: SourceStatus["id"];
  ok: boolean;
  latencyMs: number | null;
  checkedAt: string | null;
  /** Uptime ratios in [0,1]; null when no samples in the window. */
  uptime24h: number | null;
  uptime7d: number | null;
  uptime90d: number | null;
  /** Avg successful-probe latency over 24h in millis; null when no samples. */
  avgLatency24h: number | null;
}

export interface StatusHistoryPayload {
  firstLaunchAt: string;
  uptimeMs: number;
  sources: SourceHistorySummary[];
  /** Raw 24h samples per source, oldest first. */
  recent: Partial<Record<SourceStatus["id"], UptimeSample[]>>;
  /** 90 daily buckets per source, oldest first. */
  daily: Partial<Record<SourceStatus["id"], DayBucket[]>>;
  /** State transitions, newest first. */
  events: StatusEvent[];
  generatedAt: string;
}
