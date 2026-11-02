import { isRecord, obj } from "@/server/formats/scalars";
import { isValidOpenRouterDirectoryRow } from "@/server/formats/content-guards";

/**
 * OpenRouter's wire contract: the two JSON endpoints, and the derived record the directory is read into.
 *
 * The endpoints are kept apart because they answer different things — `/api/frontend/v1/rankings/models` is usage, and
 * `/api/v1/models` is the catalog every source is priced from — and because only the second one is a *shared* input:
 * `artificialAnalysis` merges its `benchmarks.artificial_analysis` block. Both readers now speak these interfaces instead
 * of a flat `Record<string, unknown>` that made a renamed field invisible to everything but a runtime miss.
 */

/**
 * OpenRouter's sentinel for a price it cannot state: a model routed dynamically ships `-1` for prompt and completion.
 * It is dropped by `numCoerceNonNegative` everywhere a real price is wanted, so it never reaches the payload as a figure.
 */
export const OR_DYNAMIC_PRICING = -1;

/** One row of `/api/frontend/v1/rankings/models`, as OpenRouter sends it. */
export interface OrRankingRow {
  date: string;
  model_permaslug: string;
  /**
   * Variant fields are not part of the identity `isOrRankingRow` establishes (it checks `model_permaslug` only), and the
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

/** The per-token prices one directory row states; every figure is USD per token, and `-1` means "dynamic". */
export interface OrPricingBlock {
  prompt?: string | number | null;
  completion?: string | number | null;
  input_cache_read?: string | number | null;
  input_cache_write?: string | number | null;
  input_cache_write_1h?: string | number | null;
}

/**
 * The Artificial Analysis index block a directory row may carry. The three field names are the ones
 * `src/server/formats/meta-fields.ts` backfills `ArtificialAnalysisModel` from, so they are declared once here and the
 * table's `model` key is typed against this interface.
 */
export interface OrAaBenchmarksBlock {
  intelligence_index?: unknown;
  coding_index?: unknown;
  agentic_index?: unknown;
}

/**
 * One row of `/api/v1/models`. Every field is optional and `unknown` because a directory row is read twice: the metadata
 * pass files the index block and the expiry date of rows that carry no usable price, so it must accept a row before
 * `isOrDirectoryRow` has established the pricing half. `isOrDirectoryRow` narrows the rest.
 */
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

/**
 * One directory row's index values and expiry date, as the directory parser files them under every model key. This is
 * OpenRouter's payload read into the shape the AA backfill consumes; it is not a third copy of the row.
 */
export interface OrMetaEntry {
  intelligenceIndex?: number;
  agenticIndex?: number;
  codingIndex?: number;
  expiresAt?: string | null;
}

/**
 * A ranking row is usable only when it names the model it aggregates under: `groupRows` keys every row by this field,
 * so a row without it is one the aggregator could not place at all.
 */
export function isOrRankingRow(value: unknown): value is OrRankingRow {
  return isRecord(value) && typeof value.model_permaslug === "string";
}

/**
 * The directory's pricing gate: an id the API would accept and a pricing object to read. It also establishes the half
 * of the row the price readers depend on, which is why they take `OrPriceableRow` and re-check nothing.
 */
export function isOrDirectoryRow(value: unknown): value is OrDirectoryRow & OrPriceableRow {
  return isValidOpenRouterDirectoryRow(value);
}

/** The `benchmarks.artificial_analysis` block of one directory row, when the row carries one. */
export function aaBenchmarksOf(row: OrDirectoryRow): OrAaBenchmarksBlock | undefined {
  const benchmarks = obj(row.benchmarks);
  const block = obj(benchmarks?.artificial_analysis);
  return block as OrAaBenchmarksBlock | undefined;
}
