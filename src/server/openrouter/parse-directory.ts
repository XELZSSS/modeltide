import { numCoerce, numCoerceNonNegative, obj } from "@/server/formats/parser-primitives";
import { isPricingRow } from "@/server/formats/wire-guards";
import { MAX_DIRECTORY_ROWS, PER_MILLION, perMillionOrNull } from "@/server/formats/limits";
import { normalizeModelKey, toStringOrNull } from "@/shared/utils";

import type { ModelMetaEntry, PricingRow } from "@/server/formats/wire-types";

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

interface DirectoryParseResult {
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
  const cacheWriteRaw = pricing.input_cache_write ?? pricing.input_cache_write_1h;
  return buildPricingEntry(
    numCoerceNonNegative(pricing.prompt),
    numCoerceNonNegative(pricing.completion),
    numCoerceNonNegative(pricing.input_cache_read),
    numCoerceNonNegative(cacheWriteRaw),
  );
}

const DYNAMIC_PRICING = -1;

function hasDynamicPricing(raw: PricingRow): boolean {
  const pricing = raw.pricing as NonNullable<PricingRow["pricing"]>;
  return numCoerce(pricing.prompt) === DYNAMIC_PRICING && numCoerce(pricing.completion) === DYNAMIC_PRICING;
}
function mergeMetaRecord(target: ModelMetaEntry, patch: ModelMetaEntry): ModelMetaEntry {
  return {
    intelligenceIndex: target.intelligenceIndex ?? patch.intelligenceIndex,
    agenticIndex: target.agenticIndex ?? patch.agenticIndex,
    codingIndex: target.codingIndex ?? patch.codingIndex,
    expiresAt: target.expiresAt ?? patch.expiresAt,
  };
}

function isoExpiry(raw: unknown): string | null {
  const value = toStringOrNull(raw);
  if (!value) return null;
  const date = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
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
  // Reused across rows: a fresh Set (and two throwaway array literals) per row cost a few allocations per directory
  // entry, and the directory allows 20k rows.
  const seen = new Set<string>();
  for (let i = 0; i < count; i++) {
    const raw: unknown = rows[i];
    if (!isPricingRow(raw)) {
      missingPricing++;
      continue;
    }
    const m = raw;
    const pricingEntry = pricingOfValidRow(m);
    if (pricingEntry) {
      const idKey = toStringOrNull(m.id);
      const slugKey = toStringOrNull(m.canonical_slug);
      let variantSlugKey: string | null = null;
      if (idKey && slugKey) {
        const variantAt = idKey.lastIndexOf(":");
        if (variantAt > 0) variantSlugKey = `${slugKey}${idKey.slice(variantAt)}`;
      }
      seen.clear();
      for (const key of [idKey, slugKey, variantSlugKey]) {
        if (!key) continue;
        for (let form = 0; form < 2; form++) {
          const index = form === 0 ? key.toLowerCase() : normalizeModelKey(key);
          if (!index || seen.has(index)) continue;
          seen.add(index);
          if (pricingRecord[index] === undefined) pricingRecord[index] = pricingEntry;
        }
      }
    } else if (!hasDynamicPricing(m)) {
      missingPricing++;
    }
    const benchmarks = obj(m.benchmarks);
    const aaBenchmarks = obj(benchmarks?.artificial_analysis);
    const intelligenceIndex = numCoerce(aaBenchmarks?.intelligence_index);
    const codingIndex = numCoerce(aaBenchmarks?.coding_index);
    const agenticIndex = numCoerce(aaBenchmarks?.agentic_index);
    const expiresAt = isoExpiry(m.expiration_date);
    if (intelligenceIndex == null && codingIndex == null && agenticIndex == null && expiresAt == null) continue;
    const metaEntry: ModelMetaEntry = {};
    if (intelligenceIndex != null) metaEntry.intelligenceIndex = intelligenceIndex;
    if (agenticIndex != null) metaEntry.agenticIndex = agenticIndex;
    if (codingIndex != null) metaEntry.codingIndex = codingIndex;
    if (expiresAt != null) metaEntry.expiresAt = expiresAt;
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
