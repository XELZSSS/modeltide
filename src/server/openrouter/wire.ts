/**
 * OpenRouter's wire contract: the two JSON endpoints and the field names each is read through. `/api/frontend/v1/rankings/
 * models` is usage and `/api/v1/models` is the catalog, which `rankings.ts` prices its rows from; the narrowing functions
 * live in `wire-read.ts`.
 */

/** OpenRouter's sentinel for a price it cannot state: a dynamically routed model ships `-1` for prompt and completion, dropped by `numCoerceNonNegative`. */
export const OR_DYNAMIC_PRICING = -1;

/** One row of `/api/frontend/v1/rankings/models`, as OpenRouter sends it. */
export interface OrRankingRow {
  date: string;
  model_permaslug: string;
  /** `isOrRankingRow` checks `model_permaslug` only, and the endpoint can omit these, so they stay optional. */
  variant?: string;
  variant_permaslug?: string;
  total_completion_tokens: number;
  total_prompt_tokens: number;
  count: number;
  /** Period-over-period change as a **ratio**, not a percentage: `changeToPercent` in aggregate.ts is the only place that scales it. */
  change: number | null;
  rankingMetricValue?: number;
}

/** The per-token prices one directory row states; every figure is USD per token, and `-1` means "dynamic". */
export interface OrPricingBlock {
  prompt?: string | number | null;
  completion?: string | number | null;
  input_cache_read?: string | number | null;
  input_cache_write?: string | number | null;
  input_cache_write_1h?: string | number | null;
}

/** The AA index block a directory row may carry: the three names `formats/meta-fields.ts` backfills from. */
export interface OrAaBenchmarksBlock {
  intelligence_index?: unknown;
  coding_index?: unknown;
  agentic_index?: unknown;
}

/** One row of `/api/v1/models`: every field is optional and `unknown` because the metadata pass reads a row before `isOrDirectoryRow` has established the pricing half. */
export interface OrDirectoryRow {
  id?: unknown;
  canonical_slug?: unknown;
  name?: unknown;
  benchmarks?: unknown;
  pricing?: unknown;
  expiration_date?: unknown;
}

/** The half of a directory row `isOrDirectoryRow` establishes: an id, and a pricing block to read prices out of. */
export interface OrPriceableRow {
  id: string;
  pricing: OrPricingBlock;
}

/** A directory row after the pricing gate: the row's own fields plus the half the gate established. */
export type OrPricedRow = OrDirectoryRow & OrPriceableRow;

/** One row's index values and expiry date, as the directory parser files them under every model key. */
export interface OrMetaEntry {
  intelligenceIndex?: number;
  agenticIndex?: number;
  codingIndex?: number;
  expiresAt?: string | null;
}

/** The readers, re-exported so a caller still imports one module: a guard with two import paths gets renamed twice. */
export { aaBenchmarksOf, isOrDirectoryRow, isOrRankingRow } from "./wire-read";
