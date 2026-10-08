export interface HFModel {
  id?: string;
  author?: string;
  downloads?: number;
  likes?: number;
  trendingScore?: number;
  pipeline_tag?: string | null;
  createdAt?: string | null;
  lastModified?: string | null;
  tags?: string[];
}

export interface ModelRow {
  date: string;
  model_permaslug: string;
  variant: string;
  variant_permaslug: string;
  total_completion_tokens: number;
  total_prompt_tokens: number;
  total_native_tokens_reasoning: number;
  total_native_tokens_cached: number;
  count: number;
  total_tool_calls: number;
  change: number | null;
  rankingMetricValue?: number;
  total_usage?: number;
  total_byok_prompt_tokens?: number;
  total_byok_completion_tokens?: number;
  num_media_prompt?: number;
  num_media_completion?: number;
  image_output_requests?: number;
}

export interface ModelMetaEntry {
  intelligenceIndex?: number;
  agenticIndex?: number;
  codingIndex?: number;
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
    web_search?: string | number | null;
    image_output?: string | number | null;
    overrides?: unknown;
  } | null;
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

export interface AgentSignalEntry {
  contenderName?: unknown;
  model?: unknown;
  modelOrganization?: unknown;
  license?: unknown;
  score?: unknown;
  ciLower?: unknown;
  ciUpper?: unknown;
}

export interface ChangelogModelEntry {
  slug?: unknown;
  name?: unknown;
  releaseSlug?: unknown;
}

export interface StatuspageSummaryRaw {
  status?: { indicator?: unknown; description?: unknown };
  components?: unknown;
  incidents?: unknown;
}

export interface GcpIncidentRaw {
  external_desc?: unknown;
  end?: unknown;
  severity?: unknown;
}
