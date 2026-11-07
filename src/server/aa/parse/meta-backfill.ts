import type { ArtificialAnalysisModel } from "@/shared/types";
import { normalizedModelKey } from "@/server/openrouter/lookup";
import type { OrMetaEntry } from "@/server/openrouter/wire";
import { INDEX_FIELDS } from "@/server/formats/meta-fields";

const TRAILING_VERSION_DIGITS_RE = /\d{4,8}$/;

function matchMeta(m: ArtificialAnalysisModel, meta: Record<string, OrMetaEntry>): OrMetaEntry | undefined {
  // One array and one memoized normalization per name. The chain built four arrays per model, and it re-normalized every
  // name with `normalizeModelKey` while the OpenRouter lookup beside it already keeps that result in its LRU.
  const keys: string[] = [];
  for (const value of [m.slug, m.name, m.short_name]) {
    if (value == null) continue;
    const key = normalizedModelKey(value);
    if (key !== "") keys.push(key);
  }
  let looseHit: OrMetaEntry | undefined;
  for (const key of keys) {
    const entry = meta[key];
    if (!entry) continue;
    if (INDEX_FIELDS.some((field) => entry[field.meta] != null)) return entry;
    looseHit ??= entry;
  }
  if (looseHit) return looseHit;
  for (const key of keys) {
    const stripped = key.replace(TRAILING_VERSION_DIGITS_RE, "");
    if (!stripped || stripped === key) continue;
    const entry = meta[stripped];
    if (entry) return entry;
  }
  return undefined;
}

/** Fills index fields that the leaderboard left empty from OpenRouter directory metadata. */
export function backfillFromMeta(models: ArtificialAnalysisModel[], meta: Record<string, OrMetaEntry>): number {
  let filled = 0;
  for (const m of models) {
    const entry = matchMeta(m, meta);
    if (!entry) continue;
    for (const field of INDEX_FIELDS) {
      const value = entry[field.meta];
      if (value == null || m[field.model] != null) continue;
      m[field.model] = value;
      filled++;
    }
  }
  return filled;
}
