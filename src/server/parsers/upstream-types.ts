/** Hugging Face `/api/models` row. */
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

/** OpenRouter `/api/frontend/v1/rankings/models` row. */
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
}

/**
 * Benchmark metadata OpenRouter mirrors from Artificial Analysis, keyed onto an
 * AA model by `normalizeModelKey`.
 */
export interface ModelMetaEntry {
  intelligenceIndex?: number;
  agenticIndex?: number;
}

/** OpenRouter `/api/v1/models` row (pricing + AA benchmark metadata). */
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

/** Artificial Analysis text-to-image raw row. */
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

/** Hugging Face `/api/daily_papers` entry. */
export interface DailyPaperEntry {
  paper?: {
    id?: unknown;
    title?: unknown;
    upvotes?: unknown;
    publishedAt?: unknown;
  };
}

/** Arena agent-board signal entry (one contender row within a signal board). */
export interface AgentSignalEntry {
  contenderName?: unknown;
  model?: unknown;
  modelOrganization?: unknown;
  license?: unknown;
  score?: unknown;
  ciLower?: unknown;
  ciUpper?: unknown;
}

/** Artificial Analysis changelog embedded model row. */
export interface ChangelogRawEntry {
  slug?: unknown;
  name?: unknown;
  release?: unknown;
  releaseDate?: unknown;
  creator?: unknown;
  deprecated?: unknown;
}

/** Statuspage `summary.json`. */
export interface StatuspageSummaryRaw {
  status?: { indicator?: unknown; description?: unknown };
  components?: unknown;
  incidents?: unknown;
}

/** Google Cloud `incidents.json` entry. */
export interface GcpIncidentRaw {
  external_desc?: unknown;
  end?: unknown;
  severity?: unknown;
}
