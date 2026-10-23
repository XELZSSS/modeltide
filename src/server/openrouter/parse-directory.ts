import { MAX_DIRECTORY_ROWS } from "@/server/formats/limits";
import { isPricingRow } from "@/server/formats/wire-guards";
import { hasDynamicPricing, pricingOfValidRow, recordPricing, type PricingRecord } from "./directory-pricing";
import { recordMeta } from "./directory-meta";
import type { ModelMetaEntry } from "@/server/formats/wire-types";

export type { PricingEntry } from "./directory-pricing";

export interface DirectoryCacheEntry {
  pricing: PricingRecord;
  meta: Record<string, ModelMetaEntry>;
}

export interface DirectoryParseResult {
  entry: DirectoryCacheEntry;
  totalRows: number;
  missingPricing: number;
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
  // Reused across rows: a fresh Set per row cost a few allocations per directory entry, and the directory allows 20k rows.
  const seen = new Set<string>();
  for (let i = 0; i < count; i++) {
    const raw: unknown = rows[i];
    if (!isPricingRow(raw)) {
      missingPricing++;
      continue;
    }
    const pricingEntry = pricingOfValidRow(raw);
    if (pricingEntry) {
      recordPricing(pricingRecord, raw, pricingEntry, seen);
    } else if (!hasDynamicPricing(raw)) {
      missingPricing++;
    }
    recordMeta(metaRecord, raw);
  }
  return { entry: { pricing: pricingRecord, meta: metaRecord }, totalRows, missingPricing };
}
