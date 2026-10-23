import type { ArtificialAnalysisModel } from "@/shared/types";
import { normalizeModelKey } from "@/shared/utils";
import type { ModelMetaEntry } from "@/server/formats/wire-types";

const TRAILING_VERSION_DIGITS_RE = /\d{4,8}$/;

function matchMeta(m: ArtificialAnalysisModel, meta: Record<string, ModelMetaEntry>): ModelMetaEntry | undefined {
  const keys: string[] = [];
  for (const raw of [m.slug, m.name, m.short_name]) {
    if (typeof raw !== "string" || !raw) continue;
    const key = normalizeModelKey(raw);
    if (key) keys.push(key);
  }
  const valued = (e: ModelMetaEntry): boolean => e.intelligenceIndex != null || e.agenticIndex != null;
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
    if (m.intelligence_index == null && entry.intelligenceIndex != null) {
      m.intelligence_index = entry.intelligenceIndex;
      filled++;
    }
    if (m.agentic_index == null && entry.agenticIndex != null) {
      m.agentic_index = entry.agenticIndex;
      filled++;
    }
    if (entry.codingIndex != null && m.coding_index !== entry.codingIndex) {
      m.coding_index = entry.codingIndex;
      filled++;
    }
  }
  return filled;
}
