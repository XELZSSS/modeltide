import { numCoerce, numCoerceNonNegative, textOrNull } from "@/server/formats/scalars";
import { PER_MILLION, perMillionOrNull } from "@/server/formats/limits";
import { fillModelKeys } from "./lookup";
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
  // `-1` is the upstream's "not applicable" sentinel and `numCoerceNonNegative` is what drops it, so the fallback has
  // to run after coercion: `??` alone kept `"-1"` and masked the hourly cache-write price behind a null.
  const cacheWrite =
    numCoerceNonNegative(pricing.input_cache_write) ?? numCoerceNonNegative(pricing.input_cache_write_1h);
  return buildPricingEntry(
    numCoerceNonNegative(pricing.prompt),
    numCoerceNonNegative(pricing.completion),
    numCoerceNonNegative(pricing.input_cache_read),
    cacheWrite,
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
  const id = textOrNull(raw.id);
  const slug = textOrNull(raw.canonical_slug);
  const variantAt = id === null ? -1 : id.lastIndexOf(":");
  const variantSuffix = id !== null && variantAt > 0 ? id.slice(variantAt) : "";
  // A variant row (`v/m:free`, `v/m:thinking`) is indexed under its own id and under the variant slug, never under the
  // bare canonical slug: the whole family shares that slug, so the first variant listed would hand its price — a free
  // row's $0 — to the paid base model, whose own row then arrives as a duplicate and is dropped.
  const variantSlug = slug !== null && variantSuffix !== "" ? `${slug}${variantSuffix}` : null;
  const bareSlug = variantSuffix === "" ? slug : null;
  fillModelKeys(seen, [id, bareSlug, variantSlug]);
  for (const index of seen) if (record[index] === undefined) record[index] = entry;
}
