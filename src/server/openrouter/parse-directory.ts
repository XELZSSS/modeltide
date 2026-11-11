import { MAX_DIRECTORY_ROWS } from "@/server/formats/limits";
import { isRecord } from "@/server/formats/scalars";
import { isOrDirectoryRow, type OrMetaEntry } from "./wire";
import { hasDynamicPricing, pricingOfValidRow, recordPricing, type PricingRecord } from "./directory-pricing";
import { recordMeta } from "./directory-meta";

export type { PricingEntry } from "./directory-pricing";

export interface DirectoryCacheEntry {
  pricing: PricingRecord;
  meta: Record<string, OrMetaEntry>;
  /** How many keys `pricing` holds, counted once here: `Object.keys` answered the same question by materializing tens of thousands of key strings. */
  pricingKeys: number;
}

interface DirectoryParseResult {
  entry: DirectoryCacheEntry;
  totalRows: number;
  missingPricing: number;
}

/**
 * Files one directory row into both records, and answers how many price keys it filled. `null` is the row that leaves
 * nothing priced; a dynamically priced row (`-1`) is priced-but-unquotable and answers `0` keys instead. Metadata is
 * filed before the pricing gate on purpose: a row without a usable price still carries the AA index fields and expiry.
 */
function fileDirectoryRow(
  raw: unknown,
  pricing: PricingRecord,
  meta: Record<string, OrMetaEntry>,
  seen: Set<string>,
): number | null {
  if (!isRecord(raw)) return null;
  recordMeta(meta, raw, seen);
  if (!isOrDirectoryRow(raw)) return null;
  const pricingEntry = pricingOfValidRow(raw);
  if (pricingEntry) return recordPricing(pricing, raw, pricingEntry, seen);
  return hasDynamicPricing(raw) ? 0 : null;
}

export function parseDirectoryRows(rows: readonly unknown[]): DirectoryParseResult {
  const pricing: PricingRecord = Object.create(null);
  const meta: Record<string, OrMetaEntry> = Object.create(null);
  // The rows arrive already proven to be an array by the directory fetch, which treats anything else as a wire-shape failure.
  const totalRows = rows.length;
  const count = Math.min(totalRows, MAX_DIRECTORY_ROWS);
  // Rows past the cap are never read, so they are as unpriced as a row without a price: counting them keeps `partialWhen` honest.
  let missingPricing = totalRows - count;
  // Reused across rows by both recorders: the directory allows 20k rows.
  const seen = new Set<string>();
  let pricingKeys = 0;
  // Walked by index, not by `mapRows`: `MAX_DIRECTORY_ROWS` bounds the rows scanned, not the rows kept.
  for (let i = 0; i < count; i++) {
    const filed = fileDirectoryRow(rows[i], pricing, meta, seen);
    if (filed === null) missingPricing += 1;
    else pricingKeys += filed;
  }
  return { entry: { pricing, meta, pricingKeys }, totalRows, missingPricing };
}
