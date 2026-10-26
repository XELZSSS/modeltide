import type { ModelPricing } from "./catalog.ts";

type OpenRouterCategory = "coding" | "reasoning" | "general";

export interface OpenRouterRankEntry {
  id: string;
  name: string;
  creator: string;
  category: OpenRouterCategory;
  variant: string | null;
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
  requestCount: number;
  change: number | null;
  pricing: ModelPricing | null;
  isFree: boolean;
  expiresAt: string | null;
}

export interface OpenSourceModelEntry {
  id: string;
  author: string | null;
  downloads: number;
  likes: number;
  license: string | null;
  task: string | null;
  createdAt: string | null;
  lastModified: string | null;
  /**
   * Tags are the largest field on a row and belong to the detail payload only: the up-to-1000-row list omits the key
   * outright instead of sending an empty array on every row.
   */
  tags?: string[];
}

export interface ClosedReleaseEntry {
  /**
   * The Artificial Analysis slug this release is identified by. Its *space* depends on which source produced the entry:
   * the changelog path carries AA's **release** slug (`releaseSlug`), while the index fallback has no release slug and
   * uses the **model** slug instead. Only one path ever runs for a given payload, and the two must not be assumed
   * interchangeable — an id from one list will not look up in the other.
   */
  id: string;
  model: string;
  provider: string;
  releaseDate: string;
  /** The model page this release belongs to, or `null` when the source offered no usable model slug. */
  link: string | null;
}

/**
 * One row of the hallucination ranking. The three rates are the upstream 0-1 ratios as sent and `omniscienceIndex` is
 * AA's signed index, so the row carries two scales: each column is formatted with its own formatter.
 */
export interface HallucinationRankingEntry {
  id: string;
  slug: string;
  model: string;
  hallucinationRate: number | null;
  accuracy: number | null;
  attemptRate: number | null;
  omniscienceIndex: number;
}

/**
 * `llm` answers with a structured output in one call; `decisionModel` returns a probability for every option, which is
 * what makes its calibration measurable. The ranking shows both side by side.
 */
export type DecisionKind = "llm" | "decisionModel";

/**
 * The five columns the Decision Index composites, over four datasets: omniscience contributes two of them, the others
 * one each. Every column is nullable because a run that failed a dataset has no score for it, and the list keeps the row.
 */
export interface DecisionScores {
  omniscienceAccuracy: number | null;
  omniscienceNonHallucinationRate: number | null;
  hleTextMcqAccuracy: number | null;
  when2callAccuracy: number | null;
  wildguardtestAverageF1: number | null;
}

/**
 * One Artificial Analysis Decision Index contestant. `id` is AA's contestant slug (`creator_model-effort`), which is
 * unique per run — the same model at two reasoning efforts is two rows.
 */
export interface DecisionIndexEntry {
  id: string;
  name: string;
  creator: string;
  kind: DecisionKind;
  /** The composite, 0-100. */
  index: number;
  costPerTaskUsd: number | null;
  timePerTaskMs: number | null;
  scores: DecisionScores;
}
