import { numCoerce, obj } from "@/server/formats/scalars";
import { isoDatePrefix } from "@/server/formats/dates";
import { fillModelKeys } from "./lookup";
import type { ModelMetaEntry } from "@/server/formats/wire-types";
import { INDEX_FIELDS } from "@/server/formats/meta-fields";

function mergeMetaRecord(target: ModelMetaEntry, patch: ModelMetaEntry): ModelMetaEntry {
  const merged: ModelMetaEntry = {};
  for (const field of INDEX_FIELDS) merged[field.meta] = target[field.meta] ?? patch[field.meta];
  merged.expiresAt = target.expiresAt ?? patch.expiresAt;
  return merged;
}

/**
 * Reads the AA benchmark block and expiry date off one directory row and files it under every model key. `keys` is
 * reused across rows by the caller, exactly as `recordPricing`'s `seen`: a fresh Set per row cost an allocation per
 * directory entry, and the directory allows 20k rows.
 */
export function recordMeta(
  meta: Record<string, ModelMetaEntry>,
  raw: Record<string, unknown>,
  keys: Set<string>,
): void {
  const benchmarks = obj(raw.benchmarks);
  const aaBenchmarks = obj(benchmarks?.artificial_analysis);
  const metaEntry: ModelMetaEntry = {};
  for (const field of INDEX_FIELDS) {
    const value = numCoerce(aaBenchmarks?.[field.model]);
    if (value != null) metaEntry[field.meta] = value;
  }
  const expiresAt = isoDatePrefix(raw.expiration_date);
  if (expiresAt != null) metaEntry.expiresAt = expiresAt;
  // A row with no index values and no expiry date has nothing to file.
  if (Object.keys(metaEntry).length === 0) return;

  // `fillModelKeys` is the same form set `recordPricing` files: the normalized key alone collapses every variant of
  // every model onto the bare suffix (`normalizeModelKey("openai/gpt-4o:free")` is `"free"`), so one row's expiry date
  // and index values would be filed under every `:free` row in the directory and `resolveExpiry` would retire them all.
  fillModelKeys(keys, [raw.name, raw.id, raw.canonical_slug]);
  for (const key of keys) {
    const cur = meta[key];
    meta[key] = cur ? mergeMetaRecord(cur, metaEntry) : metaEntry;
  }
}
