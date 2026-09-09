import type { ArtificialAnalysisModel } from "@/shared/types";
import type { ModelMetaEntry } from "@/server/sources/openrouter/types";
import { normalizeModelKey, normalizePercent } from "@/shared/utils";

function matchMeta(
  m: ArtificialAnalysisModel,
  meta: Record<string, ModelMetaEntry>,
  loose = false,
): ModelMetaEntry | undefined {
  const usable = (e: ModelMetaEntry | undefined): e is ModelMetaEntry =>
    !!e && (loose || e.intelligenceIndex != null || e.agenticIndex != null);
  const keys: string[] = [];
  for (const raw of [m.slug, m.name, m.short_name]) {
    if (!raw) continue;
    const key = normalizeModelKey(raw);
    if (key) keys.push(key);
  }
  for (const key of keys) if (usable(Object.hasOwn(meta, key) ? meta[key] : undefined)) return meta[key];
  if (!loose) return undefined;
  for (const key of keys) {
    const stripped = key.replace(/\d{4,8}$/, "");
    if (stripped && stripped !== key && usable(Object.hasOwn(meta, stripped) ? meta[stripped] : undefined)) {
      return meta[stripped];
    }
  }
  return undefined;
}

export function backfillFromMeta(models: ArtificialAnalysisModel[], meta: Record<string, ModelMetaEntry>): number {
  let filled = 0;
  for (const m of models) {
    if (m.intelligence_index != null && m.agentic_index != null) continue;
    const entry = matchMeta(m, meta);
    const loose = entry ?? matchMeta(m, meta, true);
    if (loose) {
      if (m.intelligence_index == null && loose.intelligenceIndex != null) {
        m.intelligence_index = loose.intelligenceIndex;
        filled++;
      }
      if (m.agentic_index == null && loose.agenticIndex != null) {
        m.agentic_index = normalizePercent(loose.agenticIndex);
        filled++;
      }
    }
  }
  return filled;
}
