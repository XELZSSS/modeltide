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
   * Period-over-period change as a **ratio**: `0.9562` is +95.62%, `2.6249` is +262.49%. OpenRouter's own rankings page
   * prints this column as `change * 100`, and a live probe of the endpoint confirmed it row by row, so there is no
   * second unit to disambiguate. `changeToPercent` in aggregate.ts is the only place that scales it.
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
