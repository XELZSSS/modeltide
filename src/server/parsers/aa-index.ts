import type { ArtificialAnalysisModel } from "@/shared/types";
import { obj, str } from "@/server/parsers/primitives";
import { findNextData } from "@/server/parsers/rsc";
import { hasCatalogIdentity, isNonEmptyString } from "@/server/parsers/data-filter";

export function findModelArray(tree: unknown): Record<string, unknown>[] | null {
  const candidates = [
    findNextData<Record<string, unknown>>(tree, "initialModels"),
    findNextData<Record<string, unknown>>(tree, "models"),
  ];
  for (const arr of candidates) {
    if (arr?.some((m) => m && typeof m === "object" && "intelligenceIndex" in m)) return arr;
  }
  for (const arr of candidates) {
    if (isModelArray(arr)) return arr;
  }
  return null;
}

function isModelArray(arr: unknown): arr is Record<string, unknown>[] {
  return (
    Array.isArray(arr) &&
    arr.length >= 1 &&
    arr.some((m) => m && typeof m === "object" && isNonEmptyString((m as { slug?: unknown }).slug))
  );
}

export function mergeBySlug(
  catalog: Record<string, unknown>[],
  ...enrich: Record<string, unknown>[][]
): Record<string, unknown>[] {
  const merged = new Map<string, Record<string, unknown>>();
  for (const m of catalog) {
    if (!hasCatalogIdentity(m)) continue;
    const slug = str(m.slug);
    if (!merged.has(slug)) merged.set(slug, { ...m });
  }
  for (const models of enrich) {
    for (const m of models) {
      const slug = str(m.slug);
      if (!slug || !merged.has(slug)) continue;
      const cur = merged.get(slug) as Record<string, unknown>;
      const mergedEntry: Record<string, unknown> = { ...cur };
      for (const [key, value] of Object.entries(m)) {
        if (key === "__proto__" || key === "constructor" || key === "prototype") continue;
        if (value !== null && value !== undefined && value !== "") mergedEntry[key] = value;
      }
      if (cur.omniscienceBreakdown && m.omniscienceBreakdown) {
        const patch = Object.fromEntries(
          Object.entries(obj(m.omniscienceBreakdown) ?? {}).filter(
            ([, v]) => v !== null && v !== undefined && v !== "",
          ),
        );
        mergedEntry.omniscienceBreakdown = { ...obj(cur.omniscienceBreakdown), ...patch };
      }
      merged.set(slug, mergedEntry);
    }
  }
  return [...merged.values()];
}

export interface IntelligenceIndexResult {
  models: ArtificialAnalysisModel[];
  /** Open-weights flags for the FULL pre-slice index: slug/id → flag. */
  weights: Record<string, boolean>;
  enrichFailed: boolean;
}

/** Weights lookup covering every merged model, built before the serving cap is applied. */
export function buildWeightsRecord(models: ArtificialAnalysisModel[]): Record<string, boolean> {
  // Null-prototype: keys are upstream-controlled (slug/id) and must never hit
  // Object.prototype ("__proto__" would otherwise silently drop the entry).
  const record: Record<string, boolean> = Object.create(null);
  for (const m of models) {
    if (typeof m.is_open_weights !== "boolean") continue;
    if (m.slug) record[m.slug] = m.is_open_weights;
    if (m.id && m.id !== m.slug) record[m.id] = m.is_open_weights;
  }
  return record;
}
