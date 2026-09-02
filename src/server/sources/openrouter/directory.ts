import { SLOW_TTL_MS, UPSTREAM_FETCH_OPTS, cacheKeys, upstreamConfig } from "@/shared/config";
import type { AppContext } from "@/server/context";
import { UpstreamError, errMsg } from "@/server/infra/errors";
import { num, numOr, numPositive } from "@/server/parsers/primitives";
import { normalizeModelKey } from "@/shared/utils";
import { isUsableOpenRouterPricing, isValidOpenRouterDirectoryRow } from "@/server/sources/data-filter";
import type { ModelMetaEntry, PricingEntry, PricingRecord } from "@/server/sources/openrouter/types";

export const OPENROUTER = upstreamConfig.openrouter;

export const RANKINGS_PATH = "/api/frontend/v1/rankings/models";

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
  meta: Record<string, ModelMetaEntry>;
}

const PRICING_TTL_MS = SLOW_TTL_MS;
const PER_MILLION = 1_000_000;

function buildPricingEntry(input: number, output: number, cacheHitRate: number): PricingEntry | null {
  if (!isUsableOpenRouterPricing(input, output)) return null;
  const cache = Number.isFinite(cacheHitRate) ? cacheHitRate : input;
  return { input, output, cacheHit: cache };
}

function mergeMetaRecord(target: ModelMetaEntry, patch: ModelMetaEntry): ModelMetaEntry {
  return {
    contextLength: target.contextLength ?? patch.contextLength,
    agenticIndex: target.agenticIndex ?? patch.agenticIndex,
    pricing: target.pricing ?? patch.pricing,
  };
}

function parseDirectoryRows(rows: PricingRow[]): DirectoryCacheEntry {
  const pricingRecord: PricingRecord = Object.create(null);
  const metaRecord: Record<string, ModelMetaEntry> = Object.create(null);
  for (const m of rows) {
    if (!isValidOpenRouterDirectoryRow(m)) continue;
    const pricing = m.pricing as NonNullable<PricingRow["pricing"]>;
    const input = numOr(pricing.prompt, NaN);
    const output = numOr(pricing.completion, NaN);
    const rawCache = numOr(pricing.input_cache_read, NaN);
    const cacheHitRate = Number.isFinite(rawCache) ? rawCache : input;
    const pricingEntry = buildPricingEntry(input, output, cacheHitRate);
    if (pricingEntry) {
      const keys = [m.id.trim(), m.canonical_slug?.trim()].filter((v): v is string => !!v);
      for (const key of keys) {
        pricingRecord[key] = pricingEntry;
        const lower = key.toLowerCase();
        if (lower !== key) pricingRecord[lower] = pricingEntry;
      }
    }
    const contextLength = numPositive(m.context_length);
    const agenticIndex = num(m.benchmarks?.artificial_analysis?.agentic_index);
    const metaPricing = pricingEntry
      ? { input: input * PER_MILLION, output: output * PER_MILLION, cacheHit: cacheHitRate * PER_MILLION }
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
      const cur = Object.hasOwn(metaRecord, key) ? metaRecord[key] : undefined;
      metaRecord[key] = cur ? mergeMetaRecord(cur, metaEntry) : metaEntry;
    }
  }
  if (Object.keys(pricingRecord).length === 0) {
    throw new UpstreamError(`OpenRouter: empty pricing response (raw=${rows.length}, kept=0)`);
  }
  return { pricing: pricingRecord, meta: metaRecord };
}

export async function fetchModelDirectory(ctx: AppContext): Promise<{
  pricing: Map<string, PricingEntry>;
  meta: Record<string, ModelMetaEntry>;
}> {
  try {
    const record = await ctx.cache.withTtl<DirectoryCacheEntry>(
      cacheKeys.openRouterPricing,
      PRICING_TTL_MS,
      async () => {
        const res = await ctx.http.json<{ data: PricingRow[] }>(`${OPENROUTER}/api/v1/models`, UPSTREAM_FETCH_OPTS);
        return { data: parseDirectoryRows(res?.data ?? []) };
      },
    );
    return { pricing: new Map(Object.entries(record.pricing)), meta: record.meta };
  } catch (err) {
    ctx.log("warn", `[openrouter] directory fetch failed: ${errMsg(err)}`);
    return { pricing: new Map<string, PricingEntry>(), meta: {} };
  }
}
