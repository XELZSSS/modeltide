export interface HFModel {
  id?: string;
  author?: string;
  downloads?: number;
  likes?: number;
  pipeline_tag?: string | null;
  createdAt?: string | null;
  lastModified?: string | null;
  tags?: string[];
}

export interface ModelRow {
  date: string;
  model_permaslug: string;
  /**
   * Variant fields are not part of the identity `isModelRow` establishes (it checks `model_permaslug` only), and the
   * endpoint can omit them, so they stay optional instead of making the guard claim more than it verifies.
   */
  variant?: string;
  variant_permaslug?: string;
  total_completion_tokens: number;
  total_prompt_tokens: number;
  count: number;
  /**
   * Period-over-period change, in *either* the upstream ratio form or an already-percent number; `changeToPercent` in
   * aggregate.ts normalises it and documents how the two are told apart. Never read this field directly.
   */
  change: number | null;
  rankingMetricValue?: number;
}

export interface ModelMetaEntry {
  intelligenceIndex?: number;
  agenticIndex?: number;
  codingIndex?: number;
  expiresAt?: string | null;
}

export interface PricingRow {
  id: string;
  canonical_slug?: string;
  name?: string;
  benchmarks?: {
    artificial_analysis?: { intelligence_index?: unknown; coding_index?: unknown; agentic_index?: unknown };
  };
  pricing?: {
    prompt?: string | number | null;
    completion?: string | number | null;
    input_cache_read?: string | number | null;
    input_cache_write?: string | number | null;
    input_cache_write_1h?: string | number | null;
  } | null;
  expiration_date?: string | null;
}

export interface RawEntry {
  id?: unknown;
  slug?: unknown;
  name?: unknown;
  elo?: unknown;
  lower95ci?: unknown;
  upper95ci?: unknown;
  price?: unknown;
  creator?: unknown;
}

export interface ChangelogModelEntry {
  slug?: unknown;
  name?: unknown;
  releaseSlug?: unknown;
}
