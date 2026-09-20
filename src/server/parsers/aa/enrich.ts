import { hasCatalogIdentity, isNonEmptyString, num, obj, str } from "@/server/parsers/primitives";
import type { ArtificialAnalysisModel } from "@/shared/types";
import { normalizeModelKey, normalizePercent } from "@/shared/utils";
import { findNextData } from "@/server/parsers/rsc";
import type { ModelMetaEntry } from "@/server/parsers/openrouter";

export function compactOmniscienceEnrich(m: Record<string, unknown>): Record<string, unknown> {
  const breakdown = obj(m.omniscienceBreakdown);
  return {
    slug: str(m.slug),
    omniscience: num(m.omniscience),
    omniscienceBreakdown:
      breakdown != null
        ? {
            accuracy: num(breakdown.accuracy),
            attemptRate: num(breakdown.attemptRate),
            hallucinationRate: num(breakdown.hallucinationRate),
          }
        : undefined,
  };
}

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

const PROTO_KEYS = new Set(["__proto__", "constructor", "prototype"]);

function mergeEntry(
  cur: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const mergedEntry: Record<string, unknown> = { ...cur };
  for (const [key, value] of Object.entries(patch)) {
    if (PROTO_KEYS.has(key)) continue;
    if (value !== null && value !== undefined && value !== "") mergedEntry[key] = value;
  }
  if (cur.omniscienceBreakdown && patch.omniscienceBreakdown) {
    const patchBreakdown = Object.fromEntries(
      Object.entries(obj(patch.omniscienceBreakdown) ?? {}).filter(([, v]) => v !== null && v !== undefined && v !== ""),
    );
    mergedEntry.omniscienceBreakdown = { ...obj(cur.omniscienceBreakdown), ...patchBreakdown };
  }
  return mergedEntry;
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
      merged.set(slug, mergeEntry(merged.get(slug)!, m));
    }
  }
  return [...merged.values()];
}

export interface IntelligenceIndexResult {
  models: ArtificialAnalysisModel[];
  weights: Record<string, boolean>;
  enrichFailed: boolean;
  /** Stamped once per upstream fetch so cache hits keep reporting the real refresh time. */
  fetchedAt: string;
}

export function buildWeightsRecord(models: ArtificialAnalysisModel[]): Record<string, boolean> {
  const record: Record<string, boolean> = Object.create(null);
  for (const m of models) {
    if (typeof m.is_open_weights !== "boolean") continue;
    if (m.slug) record[m.slug] = m.is_open_weights;
    if (m.id && m.id !== m.slug) record[m.id] = m.is_open_weights;
  }
  return record;
}

function matchMeta(m: ArtificialAnalysisModel, meta: Record<string, ModelMetaEntry>): ModelMetaEntry | undefined {
  const keys: string[] = [];
  for (const raw of [m.slug, m.name, m.short_name]) {
    if (!raw) continue;
    const key = normalizeModelKey(raw);
    if (key) keys.push(key);
  }
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
