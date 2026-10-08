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

export interface DirectoryParseResult {
  entry: DirectoryCacheEntry;
  totalRows: number;
  missingPricing: number;
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

function pricingOfValidRow(raw: PricingRow): PricingEntry | null {
  const pricing = raw.pricing as NonNullable<PricingRow["pricing"]>;
  // Live directory omits input_cache_write on many rows but provides
  // input_cache_write_1h; fall back so cache-write isn't needlessly null.
  // web_search / image_output / overrides are intentionally ignored:
  // ModelPricing tracks per-token text pricing only.
  const cacheWriteRaw = pricing.input_cache_write ?? pricing.input_cache_write_1h;
  return buildPricingEntry(
    numCoerceNonNegative(pricing.prompt),
    numCoerceNonNegative(pricing.completion),
    numCoerceNonNegative(pricing.input_cache_read),
    numCoerceNonNegative(cacheWriteRaw),
  );
}

export function directoryRowPricing(raw: unknown): PricingEntry | null {
  if (!isValidOpenRouterDirectoryRow(raw)) return null;
  return pricingOfValidRow(raw as unknown as PricingRow);
}

const DYNAMIC_PRICING = -1;

function dynamicPricingOfValidRow(raw: PricingRow): boolean {
  const pricing = raw.pricing as NonNullable<PricingRow["pricing"]>;
  return numCoerce(pricing.prompt) === DYNAMIC_PRICING && numCoerce(pricing.completion) === DYNAMIC_PRICING;
}

export function hasDynamicPricing(raw: unknown): boolean {
  if (!isValidOpenRouterDirectoryRow(raw)) return false;
  return dynamicPricingOfValidRow(raw as unknown as PricingRow);
}

function mergeMetaRecord(target: ModelMetaEntry, patch: ModelMetaEntry): ModelMetaEntry {
  return {
    intelligenceIndex: target.intelligenceIndex ?? patch.intelligenceIndex,
    agenticIndex: target.agenticIndex ?? patch.agenticIndex,
    codingIndex: target.codingIndex ?? patch.codingIndex,
  };
}

export function parseDirectoryRows(rows: unknown): DirectoryParseResult {
  const pricingRecord: PricingRecord = Object.create(null);
  const metaRecord: Record<string, ModelMetaEntry> = Object.create(null);
  if (!Array.isArray(rows)) {
    return { entry: { pricing: pricingRecord, meta: metaRecord }, totalRows: 0, missingPricing: 0 };
  }
  const totalRows = rows.length;
  const count = Math.min(totalRows, MAX_DIRECTORY_ROWS);
  let missingPricing = 0;
  for (let i = 0; i < count; i++) {
    const raw: unknown = rows[i];
    if (!isValidOpenRouterDirectoryRow(raw)) {
      missingPricing++;
      continue;
    }
    const m = raw as unknown as PricingRow;
    const pricingEntry = pricingOfValidRow(m);
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
    } else if (dynamicPricingOfValidRow(m)) {
      // Dynamic pricing is intentional and not a pricing gap.
    } else {
      missingPricing++;
    }
    const benchmarks = obj(m.benchmarks);
    const aaBenchmarks = obj(benchmarks?.artificial_analysis);
    const intelligenceIndex = numCoerce(aaBenchmarks?.intelligence_index);
    const codingIndex = numCoerce(aaBenchmarks?.coding_index);
    const agenticIndex = numCoerce(aaBenchmarks?.agentic_index);
    if (intelligenceIndex == null && codingIndex == null && agenticIndex == null) continue;
    const metaEntry: ModelMetaEntry = {};
    if (intelligenceIndex != null) metaEntry.intelligenceIndex = intelligenceIndex;
    if (agenticIndex != null) metaEntry.agenticIndex = agenticIndex;
    if (codingIndex != null) metaEntry.codingIndex = codingIndex;
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
  return { entry: { pricing: pricingRecord, meta: metaRecord }, totalRows, missingPricing };
}
