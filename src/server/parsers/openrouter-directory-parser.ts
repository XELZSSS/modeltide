import {
  isValidOpenRouterDirectoryRow,
  numCoerce,
  numCoerceNonNegative,
  obj,
} from "@/server/parsers/parser-primitives";
import { MAX_DIRECTORY_ROWS, PER_MILLION, perMillionOrNull } from "@/server/config/limits";
import { normalizeModelKey, toStringOrNull } from "@/shared/utils";

import type { ModelMetaEntry, PricingRow } from "@/server/parsers/upstream-types";

export interface PricingEntry {
  input: number;
  output: number;
  cacheHit: number | null;
  cacheWrite: number | null;
}

type PricingRecord = Record<string, PricingEntry>;

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
  return {
    input: input * PER_MILLION,
    output: output * PER_MILLION,
    cacheHit: perMillionOrNull(cacheHit),
    cacheWrite: perMillionOrNull(cacheWrite),
  };
}

export function directoryRowPricing(raw: unknown): PricingEntry | null {
  if (!isValidOpenRouterDirectoryRow(raw)) return null;
  const m = raw as unknown as PricingRow;
  const pricing = m.pricing as NonNullable<PricingRow["pricing"]>;
  return buildPricingEntry(
    numCoerceNonNegative(pricing.prompt),
    numCoerceNonNegative(pricing.completion),
    numCoerceNonNegative(pricing.input_cache_read),
    numCoerceNonNegative(pricing.input_cache_write),
  );
}

const DYNAMIC_PRICING = -1;

export function hasDynamicPricing(raw: unknown): boolean {
  if (!isValidOpenRouterDirectoryRow(raw)) return false;
  const pricing = (raw as unknown as PricingRow).pricing as NonNullable<PricingRow["pricing"]>;
  return numCoerce(pricing.prompt) === DYNAMIC_PRICING && numCoerce(pricing.completion) === DYNAMIC_PRICING;
}

function mergeMetaRecord(target: ModelMetaEntry, patch: ModelMetaEntry): ModelMetaEntry {
  return {
    intelligenceIndex: target.intelligenceIndex ?? patch.intelligenceIndex,
    agenticIndex: target.agenticIndex ?? patch.agenticIndex,
  };
}

export function parseDirectoryRows(rows: unknown): DirectoryCacheEntry {
  const pricingRecord: PricingRecord = Object.create(null);
  const metaRecord: Record<string, ModelMetaEntry> = Object.create(null);
  if (!Array.isArray(rows)) return { pricing: pricingRecord, meta: metaRecord };
  const count = Math.min(rows.length, MAX_DIRECTORY_ROWS);
  for (let i = 0; i < count; i++) {
    const raw: unknown = rows[i];
    if (!isValidOpenRouterDirectoryRow(raw)) continue;
    const m = raw as unknown as PricingRow;
    const pricingEntry = directoryRowPricing(raw);
    if (pricingEntry) {
      const idKey = toStringOrNull(m.id);
      const slugKey = toStringOrNull(m.canonical_slug);
      let variantSlugKey: string | null = null;
      if (idKey && slugKey) {
        const variantAt = idKey.lastIndexOf(":");
        if (variantAt > 0) variantSlugKey = `${slugKey}${idKey.slice(variantAt)}`;
      }
      const seen = new Set<string>();
      for (const key of [idKey, slugKey, variantSlugKey]) {
        if (!key) continue;
        for (const index of [key.toLowerCase(), normalizeModelKey(key)]) {
          if (!index || seen.has(index)) continue;
          seen.add(index);
          if (pricingRecord[index] === undefined) pricingRecord[index] = pricingEntry;
        }
      }
    }
    const benchmarks = obj(m.benchmarks);
    const aaBenchmarks = obj(benchmarks?.artificial_analysis);
    const intelligenceIndex = numCoerce(aaBenchmarks?.intelligence_index);
    const agenticIndex = numCoerce(aaBenchmarks?.agentic_index);
    if (intelligenceIndex == null && agenticIndex == null) continue;
    const metaEntry: ModelMetaEntry = {};
    if (intelligenceIndex != null) metaEntry.intelligenceIndex = intelligenceIndex;
    if (agenticIndex != null) metaEntry.agenticIndex = agenticIndex;
    const keys = new Set<string>();
    for (const value of [m.name, m.id, m.canonical_slug]) {
      if (typeof value === "string") {
        const key = normalizeModelKey(value);
        if (key) keys.add(key);
      }
    }
    for (const key of keys) {
      const cur = metaRecord[key];
      metaRecord[key] = cur ? mergeMetaRecord(cur, metaEntry) : metaEntry;
    }
  }
  return { pricing: pricingRecord, meta: metaRecord };
}
