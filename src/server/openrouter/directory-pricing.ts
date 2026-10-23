import { numCoerce, numCoerceNonNegative } from "@/server/formats/scalars";
import { PER_MILLION, perMillionOrNull } from "@/server/formats/limits";
import { normalizeModelKey, toStringOrNull } from "@/shared/utils";
import type { PricingRow } from "@/server/formats/wire-types";

export interface PricingEntry {
  input: number;
  output: number;
  cacheHit: number | null;
  cacheWrite: number | null;
}

export type PricingRecord = Record<string, PricingEntry>;

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

export function pricingOfValidRow(raw: PricingRow): PricingEntry | null {
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

export function hasDynamicPricing(raw: PricingRow): boolean {
  const pricing = raw.pricing as NonNullable<PricingRow["pricing"]>;
  return numCoerce(pricing.prompt) === DYNAMIC_PRICING && numCoerce(pricing.completion) === DYNAMIC_PRICING;
}

/**
 * Indexes one row's price under the raw id, its canonical slug and the canonical slug plus the
 * variant suffix, each in lowercase and normalized form. `seen` is reused across rows by the caller.
 */
export function recordPricing(record: PricingRecord, raw: PricingRow, entry: PricingEntry, seen: Set<string>): void {
  const idKey = toStringOrNull(raw.id);
  const slugKey = toStringOrNull(raw.canonical_slug);
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
      if (record[index] === undefined) record[index] = entry;
    }
  }
}
