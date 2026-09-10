import type { ArtificialAnalysisModel } from "@/shared/types";
import type { ModelMetaEntry } from "@/server/parsers/or-types";
import { normalizeModelKey, normalizePercent } from "@/shared/utils";

function matchMeta(m: ArtificialAnalysisModel, meta: Record<string, ModelMetaEntry>): ModelMetaEntry | undefined {
  const keys: string[] = [];
  for (const raw of [m.slug, m.name, m.short_name]) {
    if (!raw) continue;
    const key = normalizeModelKey(raw);
    if (key) keys.push(key);
  }
  // First direct key with at least one usable index wins; an entry present but
  // with both indexes null is remembered as a loose fallback (old strict/loose
  // double-scan semantics, now in a single pass).
  let looseHit: ModelMetaEntry | undefined;
  for (const key of keys) {
    const e = Object.hasOwn(meta, key) ? meta[key] : undefined;
    if (!e) continue;
    if (e.intelligenceIndex != null || e.agenticIndex != null) return e;
    looseHit ??= e;
  }
  if (looseHit) return looseHit;
  for (const key of keys) {
    const stripped = key.replace(/\d{4,8}$/, "");
    if (stripped && stripped !== key) {
      const e = Object.hasOwn(meta, stripped) ? meta[stripped] : undefined;
      if (e) return e;
    }
  }
  return undefined;
}

export function backfillFromMeta(models: ArtificialAnalysisModel[], meta: Record<string, ModelMetaEntry>): number {
  let filled = 0;
  for (const m of models) {
    if (m.intelligence_index != null && m.agentic_index != null) continue;
    const entry = matchMeta(m, meta);
    if (entry) {
      if (m.intelligence_index == null && entry.intelligenceIndex != null) {
        m.intelligence_index = entry.intelligenceIndex;
        filled++;
      }
      if (m.agentic_index == null && entry.agenticIndex != null) {
        m.agentic_index = normalizePercent(entry.agenticIndex);
        filled++;
      }
    }
  }
  return filled;
}
