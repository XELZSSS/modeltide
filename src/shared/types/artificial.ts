// Field names mirror the Artificial Analysis API response (snake_case).

/** Creator/vendor metadata, including a display color. */
export interface ModelCreators {
  name?: string;
  color?: string;
}

/** Per-1M-token prices in USD; cache_hit is the cached-input price. */
export interface ModelPricing {
  input?: number | null;
  output?: number | null;
  cache_hit?: number | null;
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
  benchmarks?: Record<string, number | null>;
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
  models: TextToImageModel[];
}
