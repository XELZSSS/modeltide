// Field names mirror the Artificial Analysis API response (snake_case).
import type { BenchmarkKey } from "../config/benchmarks";

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
