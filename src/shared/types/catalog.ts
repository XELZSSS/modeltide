import type { BenchmarkKey } from "@/shared/config";

export interface ModelCreators {
  name?: string;
  color?: string;
}

export interface ModelPricing {
  input?: number | null;
  output?: number | null;
  cacheHit?: number | null;
}

export interface ModelSpeed {
  median_output_speed?: number | null;
}

export interface ModelCost {
  total?: number | null;
  input?: number | null;
  output?: number | null;
  reasoning?: number | null;
}

export interface ModelOmniscienceBreakdown {
  total?: {
    accuracy?: number | null;
    attempt_rate?: number | null;
    hallucination_rate?: number | null;
    omniscience?: number | null;
  };
}

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
  benchmarks?: Partial<Record<BenchmarkKey, number | null>>;
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

export interface TextToImagePayload {
  models: TextToImageModel[];
  partial?: boolean;
  fetchedAt?: string;
}

export function isEmptyT2i(payload: TextToImagePayload | null | undefined): boolean {
  return !payload || !Array.isArray(payload.models) || payload.models.length === 0;
}
