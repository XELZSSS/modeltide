import type { ArtificialAnalysisModel } from "@/shared/types";
import { normalizeModelKey } from "@/shared/utils";
import type { ModelMetaEntry } from "@/server/formats/wire-types";
import { INDEX_FIELDS } from "@/server/formats/meta-fields";

const TRAILING_VERSION_DIGITS_RE = /\d{4,8}$/;

function matchMeta(m: ArtificialAnalysisModel, meta: Record<string, ModelMetaEntry>): ModelMetaEntry | undefined {
  const keys: string[] = [m.slug, m.name, m.short_name]
    .filter((v): v is string => v != null)
    .map(normalizeModelKey)
    .filter((key) => key !== "");
  const valued = (e: ModelMetaEntry): boolean => INDEX_FIELDS.some((field) => e[field.meta] != null);
  let looseHit: ModelMetaEntry | undefined;
  for (const key of keys) {
    const e = meta[key];
    if (!e) continue;
    if (valued(e)) return e;
    looseHit ??= e;
  }
  if (looseHit) return looseHit;
  for (const key of keys) {
    const stripped = key.replace(TRAILING_VERSION_DIGITS_RE, "");
    if (!stripped || stripped === key) continue;
    const e = meta[stripped];
    if (e) return e;
  }
  return undefined;
}

/** Fills index fields that the leaderboard left empty from OpenRouter directory metadata. */
export function backfillFromMeta(models: ArtificialAnalysisModel[], meta: Record<string, ModelMetaEntry>): number {
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
