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
  /** Tags are the largest field on a row and belong to the detail payload only: the up-to-1000-row list omits the key outright instead of sending an empty array on every row. */
  tags?: string[];
}

export interface ClosedReleaseEntry {
  /**
   * The AA **model** slug this row is: one release can carry several variants - `DeepSeek V4.1 Flash 1017` ships a `(Max)`
   * and a `(Non-reasoning)` entry, each its own row. `toClosedReleases` and `toClosedReleasesFromIndex` both name it so.
   */
  id: string;
  model: string;
  provider: string;
  releaseDate: string;
  /** The model page this row belongs to, or `null` when the source offered no usable model slug. */
  link: string | null;
}

/** One row of the hallucination ranking: the three rates are the upstream 0-1 ratios as sent, `omniscienceIndex` is AA's signed index, so each column gets its own formatter. */
export interface HallucinationRankingEntry {
  id: string;
  slug: string;
  model: string;
  hallucinationRate: number | null;
  accuracy: number | null;
  attemptRate: number | null;
  omniscienceIndex: number;
}

/** `llm` answers with a structured output in one call; `decisionModel` returns a probability for every option, which is what makes its calibration measurable. */
export type DecisionKind = "llm" | "decisionModel";

/** The Decision Index's score columns, as 0-100 percentage points. Nullable: a run that failed a dataset has no score. */
export interface DecisionScores {
  omniscienceAccuracy: number | null;
  omniscienceNonHallucinationRate: number | null;
  omniscienceDecisionScore: number | null;
  hleAccuracy: number | null;
  hleNonHallucinationRate: number | null;
  hleDecisionScore: number | null;
  when2callAccuracy: number | null;
  when2callDecisionScore: number | null;
  evalsafeOnetAccuracy: number | null;
  evalsafeOnetDecisionScore: number | null;
  documentDecisionAllPassRate: number | null;
  documentDecisionDecisionScore: number | null;
  invarianceAllPassRate: number | null;
  invarianceSymmetry: number | null;
}

/** `id` is AA's contestant slug (`creator_model-effort`), unique per run - the same model at two reasoning efforts is two rows. */
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

/**
 * The label Cursor prints *is* the identity: `Opus 5.5 Max` is a model at a named reasoning effort, and the page ranks
 * each effort variant separately, so the row key is a slug of the whole label.
 */
export interface CursorBenchEntry {
  /** Slug of `model`; the row key, because the label already carries the effort variant. */
  id: string;
  model: string;
  /** The page's own 1-based rank, kept as printed instead of re-derived from the array order. */
  rank: number;
  /** Pass rate, 0-100 — the page prints it with a `%`, and nothing is rescaled on the way in. */
  score: number;
  /** USD per task, from Cursor's published per-token prices (input, cache read, cache write, output) applied to the tokens each task used; `null` when the page prints no figure. */
  costPerTask: number | null;
  tokensPerTask: number | null;
  stepsPerTask: number | null;
}

/**
 * One row of AA's Coding Agent Index: an agent with the model it scored highest on. The index is the equally weighted
 * mean of FrontierCode v1.1, SWE-Atlas-QnA and Terminal-Bench v4, and AA publishes one row per agent x model pairing.
 */
export interface CodingAgentEntry {
  /** The upstream id of the pairing this row was taken from: the agent's highest-scoring one. */
  id: string;
  /** The agent's own name — the thing this ranking ranks, not the model it drove. */
  agent: string;
  /** The agent's publisher (`Anthropic`), or `null` when the upstream names none. */
  creator: string | null;
  /**
   * The model the agent scored highest on, e.g. `Claude Sonnet 5.5 (max with fallback)`; a router agent (GitHub Copilot,
   * Devin Fusion) reports the models it routes between instead, joined by the upstream; `null` when the row names none.
   */
  model: string | null;
  /**
   * The composite index on AA's own 0-100 scale; the upstream sends a 0-1 fraction and it is scaled here the way
   * `coding_index` and `agentic_index` are, because this is an index and not a 0-1 benchmark score.
   */
  score: number;
}
