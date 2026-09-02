import { upstreamConfig, DEFAULT_TTL_MS, THIRTY_MINUTES, PARTIAL_FAIL_TTL_MS, cacheKeys, ttlFor } from "@/shared/config";
import type { OpenRouterRankingsPayload } from "@/shared/types";
import type { AppContext } from "@/server/context";
import { UpstreamError } from "@/server/infra/errors";
import { errMsg } from "@/server/infra/utils";
import { num, numPositive } from "@/server/parsers/primitives";
import {
  mapModels,
  normalizeModelKey,
  type ModelMetaEntry,
  type ModelRow,
  type PricingEntry,
  type PricingRecord,
} from "./mapping";

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

const PRICING_TTL_MS = THIRTY_MINUTES;
const PER_MILLION = 1_000_000;

function buildPricingEntry(prompt: number, completion: number, inputCacheRead: number): PricingEntry | null {
  if (!Number.isFinite(prompt) || prompt < 0 || !Number.isFinite(completion) || completion < 0) return null;
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
    if (typeof m?.id !== "string" || !m.id.trim() || !m.pricing) continue;
    const prompt = Number(m.pricing.prompt);
    const completion = Number(m.pricing.completion);
    const inputCacheRead = Number(m.pricing.input_cache_read) || 0;
    const pricingEntry = buildPricingEntry(prompt, completion, inputCacheRead);
    if (pricingEntry) {
      pricingRecord[m.id.trim()] = pricingEntry;
      if (typeof m.canonical_slug === "string" && m.canonical_slug.trim())
        pricingRecord[m.canonical_slug.trim()] = pricingEntry;
    }
    const contextLength = numPositive(m.context_length);
    const agenticIndex = num(m.benchmarks?.artificial_analysis?.agentic_index);
    const metaPricing =
      pricingEntry
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
 * Best-effort /api/v1/models directory: per-model pricing (raw id/slug keys, consumed
 * by the rankings source) plus normalized-key AA meta (context length, agentic index)
 * consumed by the Artificial Analysis source to backfill missing fields.
 */
async function fetchModelDirectory(
  ctx: AppContext,
): Promise<{ pricing: Map<string, PricingEntry>; meta: Record<string, ModelMetaEntry> }> {
  try {
    const record = await ctx.cache.withTtl<DirectoryCacheEntry>(cacheKeys.openRouterPricing, PRICING_TTL_MS, async () => {
      const res = await ctx.http.json<{ data: PricingRow[] }>(`${OPENROUTER}/api/v1/models`, {
        timeoutMs: 15_000,
        retries: 1,
      });
      return { data: parseDirectoryRows(res?.data ?? []) };
    });
    return { pricing: new Map(Object.entries(record.pricing)), meta: record.meta };
  } catch (err) {
    ctx.log("warn", `[openrouter] directory fetch failed: ${errMsg(err)}`);
    await ctx.cache.setSafe(cacheKeys.openRouterPricing, { pricing: {}, meta: {} }, PARTIAL_FAIL_TTL_MS);
    return { pricing: new Map<string, PricingEntry>(), meta: {} };
  }
}

/** Normalized-key AA meta for cross-source backfill; empty when the directory is unavailable (never throws). */
export const getOpenRouterModelMeta = async (ctx: AppContext): Promise<Record<string, ModelMetaEntry>> =>
  (await fetchModelDirectory(ctx)).meta;

export const getOpenRouterRankings = (ctx: AppContext): Promise<OpenRouterRankingsPayload> =>
  ctx.cache.withTtl(cacheKeys.openRouterRankings, DEFAULT_TTL_MS, async () => {
    let rankings: { data?: ModelRow[] };
    try {
      rankings = await ctx.http.json<{ data: ModelRow[] }>(`${OPENROUTER}/api/frontend/v1/rankings/models`, {
        timeoutMs: 15_000,
        retries: 1,
      });
    } catch (err) {
      throw new UpstreamError(`OpenRouter: all upstream requests failed (${errMsg(err)})`);
    }
    if (!Array.isArray(rankings?.data)) {
      throw new UpstreamError("OpenRouter: rankings upstream returned a non-array response");
    }
    const validRows = rankings.data.filter((r) => typeof r.model_permaslug === "string" && r.model_permaslug.trim());
    if (validRows.length === 0 && rankings.data.length > 0) {
      // All rows invalid means the upstream schema changed; fail loudly (and skip
      // the default TTL cache) instead of silently serving an empty table.
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
      // Refresh sooner when pricing was unavailable so partial data is retried quickly.
      ttl: ttlFor(partialFailure),
    };
  });
