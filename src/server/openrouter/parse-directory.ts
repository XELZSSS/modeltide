import { MAX_DIRECTORY_ROWS } from "@/server/formats/limits";
import { isRecord } from "@/server/formats/scalars";
import { isOrDirectoryRow, type OrMetaEntry } from "./wire";
import { hasDynamicPricing, pricingOfValidRow, recordPricing, type PricingRecord } from "./directory-pricing";
import { recordMeta } from "./directory-meta";

export type { PricingEntry } from "./directory-pricing";

export interface DirectoryCacheEntry {
  pricing: PricingRecord;
  meta: Record<string, OrMetaEntry>;
  /**
   * How many keys `pricing` holds, counted once here: the directory's "nothing priced" gate and the rankings' `partial`
   * log both ask the question, and `Object.keys` answered it by materializing tens of thousands of key strings.
   */
  pricingKeys: number;
}

interface DirectoryParseResult {
  entry: DirectoryCacheEntry;
  totalRows: number;
  missingPricing: number;
}

export function parseDirectoryRows(rows: readonly unknown[]): DirectoryParseResult {
  const pricingRecord: PricingRecord = Object.create(null);
  const metaRecord: Record<string, OrMetaEntry> = Object.create(null);
  // The rows arrive already proven to be an array by the directory fetch, which treats anything else as a wire-shape
  // failure: the guard this replaced answered the same bad body a second time, as an "empty pricing" result.
  const totalRows = rows.length;
  const count = Math.min(totalRows, MAX_DIRECTORY_ROWS);
  // Rows past the cap are never read, so they are as unpriced as a row without a price: counting them here is what
  // keeps `partialWhen` honest about a directory too large to price in full, instead of dropping the tail silently.
  let missingPricing = totalRows - count;
  // Reused across rows by both recorders: a fresh Set per row cost a few allocations per directory entry, and the
  // directory allows 20k rows.
  const seen = new Set<string>();
  let pricingKeys = 0;
  for (let i = 0; i < count; i++) {
    const raw: unknown = rows[i];
    if (!isRecord(raw)) {
      missingPricing++;
      continue;
    }
    // Metadata is filed before the pricing gate: a row without a usable price still carries the AA index fields and
    // the expiry date, and dropping it there lost both the backfill and the delisted-model signal.
    recordMeta(metaRecord, raw, seen);
    if (!isOrDirectoryRow(raw)) {
      missingPricing++;
      continue;
    }
    const pricingEntry = pricingOfValidRow(raw);
    if (pricingEntry) {
      pricingKeys += recordPricing(pricingRecord, raw, pricingEntry, seen);
    } else if (!hasDynamicPricing(raw)) {
      missingPricing++;
    }
  }
  return { entry: { pricing: pricingRecord, meta: metaRecord, pricingKeys }, totalRows, missingPricing };
}
