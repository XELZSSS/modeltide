import { numCoerce } from "@/server/formats/scalars";
import { isoDatePrefix } from "@/server/formats/dates";
import { fillModelKeys } from "./lookup";
import { aaBenchmarksOf, type OrDirectoryRow, type OrMetaEntry } from "./wire";
import { INDEX_FIELDS } from "@/server/formats/meta-fields";

function mergeMetaRecord(target: OrMetaEntry, patch: OrMetaEntry): OrMetaEntry {
  const merged: OrMetaEntry = {};
  for (const field of INDEX_FIELDS) merged[field.meta] = target[field.meta] ?? patch[field.meta];
  merged.expiresAt = target.expiresAt ?? patch.expiresAt;
  return merged;
}

/**
 * Reads the AA benchmark block and expiry date off one directory row and files it under every model key. `keys` is reused
 * across rows by the caller (the directory allows 20k rows). The row is `OrDirectoryRow`: this runs before the pricing
 * gate, so it must accept the rows that gate rejects — they still carry the index values and the delisted-date signal.
 */
export function recordMeta(meta: Record<string, OrMetaEntry>, raw: OrDirectoryRow, keys: Set<string>): void {
  const aaBenchmarks = aaBenchmarksOf(raw);
  const metaEntry: OrMetaEntry = {};
  for (const field of INDEX_FIELDS) {
    const value = numCoerce(aaBenchmarks?.[field.model]);
    if (value != null) metaEntry[field.meta] = value;
  }
  const expiresAt = isoDatePrefix(raw.expiration_date);
  if (expiresAt != null) metaEntry.expiresAt = expiresAt;
  // A row with no index values and no expiry date has nothing to file.
  if (Object.keys(metaEntry).length === 0) return;

  // `fillModelKeys` is the same form set `recordPricing` files: the normalized key alone collapses variants onto the bare
  // suffix (`normalizeModelKey("openai/gpt-4o:free")` is `"free"`), which would retire every `:free` row.
  fillModelKeys(keys, [raw.name, raw.id, raw.canonical_slug]);
  for (const key of keys) {
    const cur = meta[key];
    meta[key] = cur ? mergeMetaRecord(cur, metaEntry) : metaEntry;
  }
}
