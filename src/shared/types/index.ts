import type { BenchmarkKey } from "@/shared/config";

// ---- shared/types/rankings.ts ----
// Ranking-domain types: Artificial Analysis + OpenRouter + HuggingFace + hallucination.
// Former artificial.ts + openrouter.ts + huggingface.ts + hallucination.ts combined.
// Field names mirror the Artificial Analysis API response (snake_case).

/** Creator/vendor metadata, including a display color. */
export interface ModelCreators {
  name?: string;
  color?: string;
}

/** Per-1M-token prices in USD (unit: $/1M tokens); cache_hit is the cached-input price. */
export interface ModelPricing {
  input?: number | null;
  output?: number | null;
  /** Snake-case upstream field (unit: $/1M tokens). Prefer reading via `cacheHit` alias below. */
  cache_hit?: number | null;
  /**
   * Camel-case alias of `cache_hit` (unit: $/1M tokens), kept for cross-source
   * uniformity with OpenRouter `cacheHit`. Writers may set either; readers must
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
  /**
   * Non-empty app-wide identity (never "" — compact() drops rows without slug/name;
   * callers must treat "" as absent and can use hasValidIdentity(m) to check).
   */
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
   * Canonical keys are BenchmarkKey (see shared/config/benchmarks.ts); the string
   * index keeps forward-compat for unknown upstream keys. Values are 0-100 points.
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

/** Text-to-Image leaderboard entry from Artificial Analysis (artificialanalysis.ai/text-to-image). */
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
  /**
   * Ranked models. NOTE: an empty array is ambiguous upstream (could be "no data"
   * vs "fetch failed") — server returns this shape on partial failure with
   * `partial: true`; HomeDashboardData uses `null` (not `[]`) to mean "source
   * failed". Use isEmptyT2i() (shared/types/common.ts) to test emptiness.
   */
  models: TextToImageModel[];
  /** True when this payload is a degraded/empty fallback (partial-failure TTL applies). */
  partial?: boolean;
  /** ISO fetch time; optional for backward compat with older cached payloads. */
  fetchedAt?: string;
}

/**
 * Non-empty identity contract: id must be a non-blank string.
 * Shared by server (filter) and client (lookup) so both agree on validity.
 */
export function hasValidIdentity(m: { id?: unknown; slug?: unknown } | null | undefined): boolean {
  if (!m || typeof (m as { id?: unknown }).id !== "string") return false;
  return (m as { id: string }).id.trim().length > 0;
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
  /** Author org/user; null when unknown — display via orNA(t)/t("unknown"), not a sentinel. */
  author: string | null;
  downloads: number;
  likes: number;
  /** SPDX-ish license id; null when unrecognized — display via orNA(t). */
  license: string | null;
  task: string | null;
  createdAt: string | null;
  lastModified: string | null;
  tags: string[];
}

/** One row of the Arena human-preference leaderboard (arena.ai). */
export interface ArenaRankEntry {
  rank: number;
  id: string;
  name: string;
  creator: string;
  /** Arena Elo-style score. */
  score: number | null;
  votes: number | null;
  /** True when Arena flags the row as Preliminary (too few votes to trust the rank). */
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

/** One closed-source frontier release from the Artificial Analysis changelog. */
export interface ClosedReleaseEntry {
  id: string;
  model: string;
  provider: string;
  /** ISO calendar date (YYYY-MM-DD) as published upstream. */
  releaseDate: string;
  /** Plain-English blurb; empty when the entry carries none. */
  notes: string;
  /** Artificial Analysis model page URL; null when absent. */
  link: string | null;
}

/** One officially priced model (first-party provider rate, USD per 1M tokens). */
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

// ---- shared/types/service.ts ----
// Service-domain types: home/search/health + news + status history.
// Former common.ts + news.ts + status.ts combined.

/** UI color theme, persisted in localStorage. */
export type ThemeMode = "light" | "dark";

/** Combined data served for the home dashboard. */
export interface HomeDashboardData {
  /**
   * OpenRouter rankings, or null when that source failed (NOT [] — null means
   * "fetch failed", so the UI can show degraded state instead of "0 models").
   */
  orRankings: OpenRouterRankingsPayload | null;
  /**
   * HuggingFace open-source list, or null when that source failed. An empty []
   * from upstream is treated as transient failure server-side (partial TTL);
   * home.ts settles each source to null on rejection, so null = failed.
   */
  opensource: OpenSourceModelEntry[] | null;
  /**
   * Text-to-Image payload, or null when that source failed. Distinguish from
   * `{ models: [] }` (ambiguous empty): prefer null for failure; when a payload
   * object exists check `partial === true` / isEmptyT2i() for degraded empties.
   */
  textToImage: TextToImagePayload | null;
}

/** Which home-dashboard slices are missing (partial degradation descriptor). */
export interface HomePartial {
  partial: boolean;
  missing: (keyof HomeDashboardData)[];
}

/** True when the T2I payload is absent or carries no models (null-safe). */
export function isEmptyT2i(payload: TextToImagePayload | null | undefined): boolean {
  return !payload || !Array.isArray(payload.models) || payload.models.length === 0;
}

/** Describe which HomeDashboardData slices failed (all-null => full failure). */
export function describeHomePartial(data: HomeDashboardData): HomePartial {
  const missing = (Object.keys(data) as (keyof HomeDashboardData)[]).filter((k) => data[k] == null);
  return { partial: missing.length > 0, missing };
}

/** The ranking tabs a search result can come from (each id doubles as its i18n label). */
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
  id: "artificialAnalysis" | "huggingface" | "openrouter" | "news" | "arena" | "officialPricing";
  ok: boolean;
  status: number | null;
  latencyMs: number | null;
  error: string | null;
  checkedAt: string;
}

/** News feed categories; each maps to a group of RSS feeds in rssConfig. */
export type NewsCategory = "industry" | "opensource" | "hardware" | "funding";

/** A single article parsed from an RSS feed. */
export interface NewsItem {
  id: string;
  title: string;
  link: string;
  pubDate: string;
  source: string;
}

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
  /** Time since the worker's first recorded launch (see sources/status-history.ts). */
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
