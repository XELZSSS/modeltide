import { PER_MILLION, SLOW_TTL_MS } from "@/shared/config";
import { UPSTREAM_FETCH_OPTS, cacheKeys, upstreamConfig } from "@/server/config";
import type { AppContext } from "@/server/context";
import { UpstreamError } from "@/server/infra/errors";
import { num, numOr } from "@/server/parsers/primitives";
import { normalizeModelKey } from "@/shared/utils";
import { isUsableOpenRouterPricing, isValidOpenRouterDirectoryRow } from "@/server/sources/data-filter";
import type { ModelMetaEntry, PricingEntry, PricingRecord } from "@/server/sources/openrouter/types";

export const OPENROUTER = upstreamConfig.openrouter;
export const RANKINGS_PATH = "/api/frontend/v1/rankings/models";

interface PricingRow {
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

interface DirectoryCacheEntry {
  pricing: PricingRecord;
  meta: Record<string, ModelMetaEntry>;
}

const PRICING_TTL_MS = SLOW_TTL_MS;

function buildPricingEntry(input: number, output: number, cacheHit: number | null, cacheWrite: number | null): PricingEntry | null {
  if (!isUsableOpenRouterPricing(input, output)) return null;
  return {
    input: input * PER_MILLION,
    output: output * PER_MILLION,
    cacheHit: cacheHit == null ? null : cacheHit * PER_MILLION,
    cacheWrite: cacheWrite == null ? null : cacheWrite * PER_MILLION,
  };
}

function mergeMetaRecord(target: ModelMetaEntry, patch: ModelMetaEntry): ModelMetaEntry {
  return { intelligenceIndex: target.intelligenceIndex ?? patch.intelligenceIndex, agenticIndex: target.agenticIndex ?? patch.agenticIndex };
}

export function parseDirectoryRows(rows: PricingRow[]): DirectoryCacheEntry {
  const pricingRecord: PricingRecord = Object.create(null);
  const metaRecord: Record<string, ModelMetaEntry> = Object.create(null);
  for (const m of rows) {
    if (!isValidOpenRouterDirectoryRow(m)) continue;
    const pricing = m.pricing as NonNullable<PricingRow["pricing"]>;
    const input = numOr(pricing.prompt, NaN);
    const output = numOr(pricing.completion, NaN);
    // OpenRouter uses -1 as a "dynamic/unavailable" sentinel on price legs; a
    // negative cache leg must not surface as a negative $/M price.
    const rawCache = numOr(pricing.input_cache_read, NaN);
    const cacheHitRate = Number.isFinite(rawCache) && rawCache >= 0 ? rawCache : null;
    const rawCacheWrite = numOr(pricing.input_cache_write, NaN);
    const cacheWriteRate = Number.isFinite(rawCacheWrite) && rawCacheWrite >= 0 ? rawCacheWrite : null;
    const pricingEntry = buildPricingEntry(input, output, cacheHitRate, cacheWriteRate);
    if (pricingEntry) {
      const keys = [m.id.trim(), m.canonical_slug?.trim()].filter((v): v is string => !!v);
      for (const key of keys) {
        pricingRecord[key] = pricingEntry;
        const lower = key.toLowerCase();
        if (lower !== key) pricingRecord[lower] = pricingEntry;
      }
    }
    const aaBenchmarks = m.benchmarks?.artificial_analysis;
    const intelligenceIndex = num(aaBenchmarks?.intelligence_index);
    const agenticIndex = num(aaBenchmarks?.agentic_index);
    if (intelligenceIndex == null && agenticIndex == null) continue;
    const metaEntry: ModelMetaEntry = {};
    if (intelligenceIndex != null) metaEntry.intelligenceIndex = intelligenceIndex;
    if (agenticIndex != null) metaEntry.agenticIndex = agenticIndex;
    const keys = new Set([m.name, m.id, m.canonical_slug].map((v) => (typeof v === "string" ? normalizeModelKey(v) : "")).filter(Boolean));
    for (const key of keys) {
      const cur = Object.hasOwn(metaRecord, key) ? metaRecord[key] : undefined;
      metaRecord[key] = cur ? mergeMetaRecord(cur, metaEntry) : metaEntry;
    }
  }
  if (Object.keys(pricingRecord).length === 0) throw new UpstreamError(`OpenRouter: empty pricing response (raw=${rows.length}, kept=0)`);
  return { pricing: pricingRecord, meta: metaRecord };
}

// ── Raw fetch (no cache, throws) ────────────────────────────────
export async function fetchModelDirectory(ctx: AppContext): Promise<DirectoryCacheEntry> {
  const res = await ctx.http.json<{ data: PricingRow[] }>(`${OPENROUTER}/api/v1/models`, UPSTREAM_FETCH_OPTS);
  return parseDirectoryRows(res?.data ?? []);
}

// ── Cached (unified get*) ───────────────────────────────────────
export async function getModelDirectory(ctx: AppContext): Promise<DirectoryCacheEntry> {
  return ctx.cache.withTtl<DirectoryCacheEntry>(cacheKeys.openRouterPricing, PRICING_TTL_MS, async () => {
    const data = await fetchModelDirectory(ctx);
    return { data };
  });
}
