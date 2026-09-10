import { PER_MILLION } from "@/shared/config";
import { UpstreamError } from "@/server/infra/errors";
import { num, numCoerce } from "@/server/parsers/primitives";
import { normalizeModelKey } from "@/shared/utils";
import { isUsableOpenRouterPricing, isValidOpenRouterDirectoryRow } from "@/server/parsers/data-filter";
import type { ModelMetaEntry, PricingEntry, PricingRecord } from "@/server/parsers/or-types";

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

export interface DirectoryCacheEntry {
  pricing: PricingRecord;
  meta: Record<string, ModelMetaEntry>;
}

function buildPricingEntry(
  input: number | null,
  output: number | null,
  cacheHit: number | null,
  cacheWrite: number | null,
): PricingEntry | null {
  if (input == null || output == null) return null;
  if (!isUsableOpenRouterPricing(input, output)) return null;
  return {
    input: input * PER_MILLION,
    output: output * PER_MILLION,
    cacheHit: cacheHit == null ? null : cacheHit * PER_MILLION,
    cacheWrite: cacheWrite == null ? null : cacheWrite * PER_MILLION,
  };
}

function mergeMetaRecord(target: ModelMetaEntry, patch: ModelMetaEntry): ModelMetaEntry {
  return {
    intelligenceIndex: target.intelligenceIndex ?? patch.intelligenceIndex,
    agenticIndex: target.agenticIndex ?? patch.agenticIndex,
  };
}

export function parseDirectoryRows(rows: PricingRow[]): DirectoryCacheEntry {
  const pricingRecord: PricingRecord = Object.create(null);
  const metaRecord: Record<string, ModelMetaEntry> = Object.create(null);
  for (const m of rows) {
    if (!isValidOpenRouterDirectoryRow(m)) continue;
    const pricing = m.pricing as NonNullable<PricingRow["pricing"]>;
    // OpenRouter uses -1 as a "dynamic/unavailable" sentinel on every price
    // leg (prompt/completion/cache). Normalize negatives to null up front so
    // a -1 prompt/completion drops the entry via buildPricingEntry instead of
    // surfacing as a negative $/M price.
    const rawInput = numCoerce(pricing.prompt);
    const rawOutput = numCoerce(pricing.completion);
    const input = rawInput != null && rawInput >= 0 ? rawInput : null;
    const output = rawOutput != null && rawOutput >= 0 ? rawOutput : null;
    const rawCache = numCoerce(pricing.input_cache_read);
    const cacheHitRate = rawCache != null && rawCache >= 0 ? rawCache : null;
    const rawCacheWrite = numCoerce(pricing.input_cache_write);
    const cacheWriteRate = rawCacheWrite != null && rawCacheWrite >= 0 ? rawCacheWrite : null;
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
    const keys = new Set(
      [m.name, m.id, m.canonical_slug].map((v) => (typeof v === "string" ? normalizeModelKey(v) : "")).filter(Boolean),
    );
    for (const key of keys) {
      const cur = Object.hasOwn(metaRecord, key) ? metaRecord[key] : undefined;
      metaRecord[key] = cur ? mergeMetaRecord(cur, metaEntry) : metaEntry;
    }
  }
  if (Object.keys(pricingRecord).length === 0)
    throw new UpstreamError(`OpenRouter: empty pricing response (raw=${rows.length}, kept=0)`);
  return { pricing: pricingRecord, meta: metaRecord };
}
