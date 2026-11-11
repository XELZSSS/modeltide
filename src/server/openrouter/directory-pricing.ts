import { numCoerce, numCoerceNonNegative, textOrNull } from "@/server/formats/scalars";
import { PER_MILLION, perMillionOrNull } from "@/server/formats/limits";
import { fillModelKeys } from "./lookup";
import { OR_DYNAMIC_PRICING, type OrPricedRow } from "./wire";

/** The prices one model is filed under, in USD per million tokens: the wire states USD per token, so the conversion happens once, here. */
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

export function pricingOfValidRow(raw: OrPricedRow): PricingEntry | null {
  // `isOrDirectoryRow` is what established `pricing` is an object, so this reads it as a declared member.
  const pricing = raw.pricing;
  // `-1` is the upstream's "not applicable" sentinel, dropped by `numCoerceNonNegative`, so the fallback runs after coercion.
  const cacheWrite =
    numCoerceNonNegative(pricing.input_cache_write) ?? numCoerceNonNegative(pricing.input_cache_write_1h);
  return buildPricingEntry(
    numCoerceNonNegative(pricing.prompt),
    numCoerceNonNegative(pricing.completion),
    numCoerceNonNegative(pricing.input_cache_read),
    cacheWrite,
  );
}

export function hasDynamicPricing(raw: OrPricedRow): boolean {
  const pricing = raw.pricing;
  return numCoerce(pricing.prompt) === OR_DYNAMIC_PRICING && numCoerce(pricing.completion) === OR_DYNAMIC_PRICING;
}

/**
 * Indexes one row's price under the raw id, its canonical slug and the canonical slug plus variant suffix, each lowercased
 * and normalized. Answers how many keys it filled, so the caller need not count them with `Object.keys(record).length`.
 */
export function recordPricing(record: PricingRecord, raw: OrPricedRow, entry: PricingEntry, seen: Set<string>): number {
  const id = textOrNull(raw.id);
  const slug = textOrNull(raw.canonical_slug);
  const variantAt = id === null ? -1 : id.lastIndexOf(":");
  const variantSuffix = id !== null && variantAt > 0 ? id.slice(variantAt) : "";
  // A variant row (`v/m:free`, `v/m:thinking`) is indexed under its own id and its variant slug, never under the bare
  // canonical slug: the whole family shares that slug, so the first variant would hand its $0 to the paid base model.
  const variantSlug = slug !== null && variantSuffix !== "" ? `${slug}${variantSuffix}` : null;
  const bareSlug = variantSuffix === "" ? slug : null;
  fillModelKeys(seen, [id, bareSlug, variantSlug]);
  let added = 0;
  for (const index of seen) {
    if (record[index] !== undefined) continue;
    record[index] = entry;
    added += 1;
  }
  return added;
}
