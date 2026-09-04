import { upstreamConfig, DEFAULT_TTL_MS, SLOW_TTL_MS, cacheKeys, ttlFor, UPSTREAM_TIMEOUT_MS } from "@/shared/config";
import type { OpenRouterRankEntry, OpenRouterRankingsPayload } from "@/shared/types";
import type { AppContext } from "@/server/context";
import { UpstreamError, errMsg } from "@/server/infra";
import { num, numCoerce, numOr, numPositive, titleCase } from "@/server/parsers/primitives";
import {
  isUsableOpenRouterPricing,
  isValidOpenRouterDirectoryRow,
  isValidOpenRouterRowId,
} from "@/server/sources/data-filter";

// Ranking mapping (pure): variant aggregation, titles, categories.
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
  prompt: number;
  completion: number;
  input_cache_read: number;
}

export type PricingRecord = Record<string, PricingEntry>;

/** AA agentic index, context length and $/1M pricing, for cross-source backfill. */
export interface ModelMetaEntry {
  contextLength?: number;
  agenticIndex?: number;
  /** OpenRouter pricing converted from per-token to $/1M tokens. */
  pricing?: { input: number; output: number; cacheHit: number };
}

import { normalizeModelKey } from "@/shared/utils";

const CREATORS: Record<string, string> = {
  anthropic: "Anthropic",
  cohere: "Cohere",
  deepseek: "DeepSeek",
  google: "Google",
  mistralai: "Mistral",
  "meta-llama": "Meta",
  minimax: "MiniMax",
  openai: "OpenAI",
  qwen: "Qwen",
  xiaomi: "Xiaomi",
};

export function creatorFromSlug(slug: string): string {
  const p = slug.split("/")[0]?.trim() || "Unknown";
  const lower = p.toLowerCase();
  if (CREATORS[lower]) return CREATORS[lower]!;
  return p.split(/[-_]/).filter(Boolean).map(titleCase).join(" ");
}

const CODING_RE = /\b(?:coder|coding|code|codex)\b/;
const REASONING_RE = /\b(?:reasoning|thought)\b/;
const REASONING_SUFFIX_RE = /-(?:r1|o1)\b/;

export function categoryFrom(slug: string, name: string): OpenRouterRankEntry["category"] {
  const v = `${slug} ${name}`.toLowerCase();
  if (CODING_RE.test(v)) return "coding";
  if (REASONING_RE.test(v) || REASONING_SUFFIX_RE.test(v)) return "reasoning";
  return "general";
}

export function titleFromSlug(permaslug: string): string {
  const raw = permaslug.split("/").slice(1).join("/") || permaslug;
  return raw
    .replace(/[:/_.]/g, " ")
    .split(/[-\s]+/)
    .filter(Boolean)
    .map((p) => (/^\d/.test(p) ? p.toLowerCase() : p.length <= 3 ? p.toUpperCase() : titleCase(p)))
    .join(" ");
}

/** Upstream `change` may be a number or numeric string; normalize to number|null. */
export function parseChange(v: unknown): number | null {
  return numCoerce(v);
}

const SUM_KEYS = [
  "total_prompt_tokens",
  "total_completion_tokens",
  "total_native_tokens_reasoning",
  "count",
  "image_output_requests",
  "video_output_seconds",
] as const;

export function mapModels(rows: ModelRow[], pricingMap: Map<string, PricingEntry>): OpenRouterRankEntry[] {
  // Upstream emits one row per variant; merge into one entry per model id.
  // Usage fields sum; the dominant variant lends its label and pricing.
  interface Group {
    agg: ModelRow;
    dominant: ModelRow;
    dominantTokens: number;
    latestDate: string;
  }
  const grouped = new Map<string, Group>();
  for (const row of rows) {
    if (!isValidOpenRouterRowId(row.model_permaslug)) continue;
    const id = row.model_permaslug.trim();
    const tokens = numOr(row.total_prompt_tokens, 0) + numOr(row.total_completion_tokens, 0);
    const group = grouped.get(id);
    if (!group) {
      grouped.set(id, {
        agg: { ...row, model_permaslug: id },
        dominant: row,
        dominantTokens: tokens,
        latestDate: row.date ?? "",
      });
      continue;
    }
    for (const k of SUM_KEYS) group.agg[k] = numOr(group.agg[k], 0) + numOr(row[k], 0);
    // `change` belongs to the latest-dated row.
    if (row.date && (!group.latestDate || row.date > group.latestDate)) {
      group.latestDate = row.date;
      group.agg.date = row.date;
      const parsedChange = parseChange(row.change);
      if (parsedChange != null) group.agg.change = parsedChange;
    } else if (!group.latestDate) {
      const parsedChange = parseChange(row.change);
      if (parsedChange != null && group.agg.change == null) group.agg.change = parsedChange;
    }
    if (tokens > group.dominantTokens) {
      group.dominant = row;
      group.dominantTokens = tokens;
    }
  }
  const merged = Array.from(grouped.values()).sort(
    (a, b) =>
      numOr(b.agg.total_prompt_tokens, 0) +
      numOr(b.agg.total_completion_tokens, 0) -
      (numOr(a.agg.total_prompt_tokens, 0) + numOr(a.agg.total_completion_tokens, 0)),
  );
  const out: OpenRouterRankEntry[] = [];
  for (let i = 0; i < merged.length; i++) {
    const { agg: row, dominant } = merged[i]!;
    const id = row.model_permaslug;
    const name = titleFromSlug(id) || id;
    const pricing = pricingMap.get(dominant.variant_permaslug) ?? pricingMap.get(id);
    const isFree = pricing
      ? pricing.prompt === 0 && pricing.completion === 0 && pricing.input_cache_read === 0
      : undefined;
    out.push({
      rank: i + 1,
      id,
      name,
      creator: creatorFromSlug(id),
      category: categoryFrom(id, name),
      variant: typeof dominant.variant === "string" && dominant.variant ? dominant.variant : undefined,
      totalTokens: numOr(row.total_prompt_tokens, 0) + numOr(row.total_completion_tokens, 0),
      promptTokens: numOr(row.total_prompt_tokens, 0),
      completionTokens: numOr(row.total_completion_tokens, 0),
      reasoningTokens: numOr(row.total_native_tokens_reasoning, 0),
      requestCount: numOr(row.count, 0),
      imageOutputRequests: numOr(row.image_output_requests, 0),
      videoOutputSeconds: numOr(row.video_output_seconds, 0),
      change: parseChange(row.change),
      pricing,
      isFree,
    });
  }
  return out;
}

// Rankings source (fetch + cache).
const OPENROUTER = upstreamConfig.openrouter;

interface PricingRow {
  id: string;
  canonical_slug?: string;
  name?: string;
  context_length?: unknown;
  benchmarks?: { artificial_analysis?: { agentic_index?: unknown } };
  pricing?: { prompt?: string | number; completion?: string | number; input_cache_read?: string | number };
}

interface DirectoryCacheEntry {
  pricing: PricingRecord;
  /** Loose match keys (normalizeModelKey) → AA metrics for cross-source backfill. */
  meta: Record<string, ModelMetaEntry>;
}

const PRICING_TTL_MS = SLOW_TTL_MS;
const PER_MILLION = 1_000_000;
const DIRECTORY_FETCH_OPTS = { timeoutMs: UPSTREAM_TIMEOUT_MS, retries: 1 } as const;

// Pricing figures arrive as numbers or numeric strings.
function parsePrice(v: unknown): number {
  return numOr(v, NaN);
}

function buildPricingEntry(prompt: number, completion: number, inputCacheRead: number): PricingEntry | null {
  if (!isUsableOpenRouterPricing(prompt, completion)) return null;
  return { prompt, completion, input_cache_read: Number.isFinite(inputCacheRead) ? inputCacheRead : 0 };
}

function mergeMetaRecord(target: ModelMetaEntry, patch: ModelMetaEntry): ModelMetaEntry {
  return {
    contextLength: target.contextLength ?? patch.contextLength,
    agenticIndex: target.agenticIndex ?? patch.agenticIndex,
    pricing: target.pricing ?? patch.pricing,
  };
}

function parseDirectoryRows(rows: PricingRow[]): DirectoryCacheEntry {
  const pricingRecord: PricingRecord = {};
  const metaRecord: Record<string, ModelMetaEntry> = {};
  for (const m of rows) {
    if (!isValidOpenRouterDirectoryRow(m)) continue;
    const pricing = m.pricing as NonNullable<PricingRow["pricing"]>;
    const prompt = parsePrice(pricing.prompt);
    const completion = parsePrice(pricing.completion);
    const rawCache = parsePrice(pricing.input_cache_read);
    const inputCacheRead = Number.isFinite(rawCache) ? rawCache : 0;
    const pricingEntry = buildPricingEntry(prompt, completion, inputCacheRead);
    if (pricingEntry) {
      pricingRecord[m.id.trim()] = pricingEntry;
      if (typeof m.canonical_slug === "string" && m.canonical_slug.trim())
        pricingRecord[m.canonical_slug.trim()] = pricingEntry;
    }
    const contextLength = numPositive(m.context_length);
    const agenticIndex = num(m.benchmarks?.artificial_analysis?.agentic_index);
    const metaPricing = pricingEntry
      ? { input: prompt * PER_MILLION, output: completion * PER_MILLION, cacheHit: inputCacheRead * PER_MILLION }
      : undefined;
    if (contextLength == null && agenticIndex == null && metaPricing == null) continue;
    const metaEntry: ModelMetaEntry = {};
    if (contextLength != null) metaEntry.contextLength = contextLength;
    if (agenticIndex != null) metaEntry.agenticIndex = agenticIndex;
    if (metaPricing) metaEntry.pricing = metaPricing;
    const keys = new Set(
      [m.name, m.id, m.canonical_slug].map((v) => (typeof v === "string" ? normalizeModelKey(v) : "")).filter(Boolean),
    );
    for (const key of keys) {
      const cur = metaRecord[key];
      metaRecord[key] = cur ? mergeMetaRecord(cur, metaEntry) : metaEntry;
    }
  }
  if (Object.keys(pricingRecord).length === 0) throw new UpstreamError("OpenRouter: empty pricing response");
  return { pricing: pricingRecord, meta: metaRecord };
}

/**
 * /api/v1/models directory: pricing plus normalized AA meta for backfill.
 * Never throws — callers degrade to partial data.
 */
async function fetchModelDirectory(ctx: AppContext): Promise<{
  pricing: Map<string, PricingEntry>;
  meta: Record<string, ModelMetaEntry>;
}> {
  try {
    const record = await ctx.cache.withTtl<DirectoryCacheEntry>(
      cacheKeys.openRouterPricing,
      PRICING_TTL_MS,
      async () => {
        const res = await ctx.http.json<{ data: PricingRow[] }>(`${OPENROUTER}/api/v1/models`, DIRECTORY_FETCH_OPTS);
        return { data: parseDirectoryRows(res?.data ?? []) };
      },
    );
    return { pricing: new Map(Object.entries(record.pricing)), meta: record.meta };
  } catch (err) {
    ctx.log("warn", `[openrouter] directory fetch failed: ${errMsg(err)}`);
    return { pricing: new Map<string, PricingEntry>(), meta: {} };
  }
}

/** Normalized-key AA meta for backfill; empty when unavailable (never throws). */
export const getOpenRouterModelMeta = async (ctx: AppContext): Promise<Record<string, ModelMetaEntry>> =>
  (await fetchModelDirectory(ctx)).meta;

export const getOpenRouterRankings = (ctx: AppContext): Promise<OpenRouterRankingsPayload> =>
  ctx.cache.withTtl(cacheKeys.openRouterRankings, DEFAULT_TTL_MS, async () => {
    let rankings: { data?: ModelRow[] };
    try {
      rankings = await ctx.http.json<{ data: ModelRow[] }>(
        `${OPENROUTER}/api/frontend/v1/rankings/models`,
        DIRECTORY_FETCH_OPTS,
      );
    } catch (err) {
      throw new UpstreamError(`OpenRouter: all upstream requests failed (${errMsg(err)})`);
    }
    if (!Array.isArray(rankings?.data)) {
      throw new UpstreamError("OpenRouter: rankings upstream returned a non-array response");
    }
    if (rankings.data.length === 0) {
      throw new UpstreamError("OpenRouter: rankings upstream returned empty array");
    }
    const validRows = rankings.data.filter((r) => isValidOpenRouterRowId(r.model_permaslug));
    if (validRows.length === 0 && rankings.data.length > 0) {
      throw new UpstreamError(`OpenRouter: all ${rankings.data.length} ranking rows had invalid model_permaslug`);
    }
    const pricingMap = (await fetchModelDirectory(ctx)).pricing;
    const partialFailure = pricingMap.size === 0;
    const models = mapModels(validRows, pricingMap);
    if (models.length === 0 && validRows.length > 0) {
      throw new UpstreamError(`OpenRouter: parsing yielded 0 models from ${validRows.length} rows`);
    }
    return {
      data: {
        tokenUsageRankings: models,
        fetchedAt: new Date().toISOString(),
      },
      ttl: ttlFor(partialFailure),
    };
  });
