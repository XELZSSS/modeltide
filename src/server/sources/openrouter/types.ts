export interface ModelRow {
  date: string;
  model_permaslug: string;
  variant: string;
  variant_permaslug: string;
  total_completion_tokens: number;
  total_prompt_tokens: number;
  total_native_tokens_reasoning: number;
  count: number;
  image_output_requests: number;
  video_output_seconds: number;
  change: number | null;
}

export interface PricingEntry {
  input: number;
  output: number;
  cacheHit: number;
}

export type PricingRecord = Record<string, PricingEntry>;

export interface ModelMetaEntry {
  contextLength?: number;
  agenticIndex?: number;
  pricing?: { input: number; output: number; cacheHit: number };
}
