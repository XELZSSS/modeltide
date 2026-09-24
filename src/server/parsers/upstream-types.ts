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
}

export interface ModelMetaEntry {
  intelligenceIndex?: number;
  agenticIndex?: number;
}

export interface PricingRow {
  id: string;
  canonical_slug?: string;
  name?: string;
  benchmarks?: { artificial_analysis?: { intelligence_index?: unknown; agentic_index?: unknown } };
  pricing?: {
    prompt?: string | number;
    completion?: string | number;
    input_cache_read?: string | number;
    input_cache_write?: string | number;
  };
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

export interface DailyPaperEntry {
  paper?: {
    id?: unknown;
    title?: unknown;
    upvotes?: unknown;
    publishedAt?: unknown;
  };
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

export interface ChangelogRawEntry {
  slug?: unknown;
  name?: unknown;
  release?: unknown;
  releaseDate?: unknown;
  creator?: unknown;
  deprecated?: unknown;
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
