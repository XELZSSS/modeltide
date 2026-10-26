import type { ModalityKey } from "../config/ui.ts";
import type { BenchmarkKey } from "./benchmark.ts";

interface ModelCreators {
  name: string;
  color: string | null;
}

export interface ModelPricing {
  input: number | null;
  output: number | null;
  cacheHit: number | null;
  cacheWrite: number | null;
}

interface ModelSpeed {
  median_output_speed: number | null;
}

/**
 * The omniscience evaluation exactly as the upstream sends it: the three rates are 0-1 ratios and `omniscience` is a
 * signed index, so nothing here is rescaled. A surface that needs one axis normalises where it plots.
 */
interface ModelOmniscienceTotal {
  accuracy: number | null;
  attempt_rate: number | null;
  hallucination_rate: number | null;
  omniscience: number | null;
}

export interface ModelOmniscienceBreakdown {
  total: ModelOmniscienceTotal;
}

/**
 * The modalities a model accepts and produces, as `MODALITY_KEYS`-ordered arrays. Eight booleans said the same thing at
 * ~226 bytes a row — of which six never changed value — and this costs a tenth of it.
 */
export interface ModelModalities {
  in: ModalityKey[];
  out: ModalityKey[];
}

export interface ArtificialAnalysisModel {
  id: string;
  slug: string;
  name: string;
  short_name: string | null;
  model_creators: ModelCreators | null;
  intelligence_index: number | null;
  is_reasoning: boolean;
  release_date: string | null;
  is_open_weights: boolean;
  parameters: number | null;
  size_class: string | null;
  /** Context window in tokens; the upstream publishes it on every leaderboard row. */
  context_window_tokens: number | null;
  coding_index: number | null;
  agentic_index: number | null;
  /**
   * Upstream values, unscaled: a `ratio` benchmark is the source 0-1 number, an `index` one keeps its own range (Elo,
   * the signed omniscience index, the Cyber index). `benchmarkScaleOf` is what tells the two apart.
   */
  benchmarks: Partial<Record<BenchmarkKey, number | null>>;
  pricing: ModelPricing | null;
  speed: ModelSpeed | null;
  modalities: ModelModalities;
  omniscience_breakdown: ModelOmniscienceBreakdown | null;
}

export interface TextToImageModel {
  id: string;
  slug: string;
  name: string;
  elo: number | null;
  eloLower: number | null;
  eloUpper: number | null;
  /**
   * USD per 1000 images, taken straight from the upstream `price` field: AA already prices image models per 1k images,
   * so no conversion happens on the way in and the unit is asserted here rather than derived. Render it with a unit
   * (`/1k images`), never as a per-token or per-million figure.
   */
  pricePer1kImages: number | null;
  creatorName: string | null;
}
