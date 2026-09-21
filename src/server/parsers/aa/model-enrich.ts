import { hasCatalogIdentity, isNonEmptyString, isRecord, numCoerce, obj, str } from "@/server/parsers/parser-primitives";
import type { ArtificialAnalysisModel } from "@/shared/types";
import { normalizeModelKey, normalizePercent } from "@/shared/utils";
import { findNextData } from "@/server/parsers/rsc-parser";
import type { ModelMetaEntry } from "@/server/parsers/openrouter-parser";

export function compactOmniscienceEnrich(m: unknown): Record<string, unknown> {
  const rec = isRecord(m) ? m : {};
  const breakdown = obj(rec.omniscienceBreakdown);
  return {
    slug: str(rec.slug),
    omniscience: numCoerce(rec.omniscience),
    omniscienceBreakdown:
      breakdown != null
        ? {
            accuracy: numCoerce(breakdown.accuracy),
            attemptRate: numCoerce(breakdown.attemptRate),
            hallucinationRate: numCoerce(breakdown.hallucinationRate),
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

function mergeEntry(cur: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
  const mergedEntry: Record<string, unknown> = { ...cur };
  for (const [key, value] of Object.entries(patch)) {
    if (PROTO_KEYS.has(key)) continue;
    if (value !== null && value !== undefined && value !== "") mergedEntry[key] = value;
  }
  if (cur.omniscienceBreakdown && patch.omniscienceBreakdown) {
    const patchBreakdown = Object.fromEntries(
      Object.entries(obj(patch.omniscienceBreakdown) ?? {}).filter(
        ([, v]) => v !== null && v !== undefined && v !== "",
      ),
    );
    mergedEntry.omniscienceBreakdown = { ...obj(cur.omniscienceBreakdown), ...patchBreakdown };
  }
  return mergedEntry;
}

export function mergeBySlug(
  catalog: unknown,
  ...enrich: unknown[]
): Record<string, unknown>[] {
  const merged = new Map<string, Record<string, unknown>>();
  const catalogArr = Array.isArray(catalog) ? catalog.slice(0, 20_000) : [];
  for (const raw of catalogArr) {
    if (!isRecord(raw) || !hasCatalogIdentity(raw)) continue;
    const slug = str(raw.slug);
    if (!merged.has(slug)) merged.set(slug, { ...raw });
  }
  for (const group of enrich) {
    if (!Array.isArray(group)) continue;
    for (const raw of (group as unknown[]).slice(0, 20_000)) {
      if (!isRecord(raw)) continue;
      const slug = str(raw.slug);
      if (!slug || !merged.has(slug)) continue;
      merged.set(slug, mergeEntry(merged.get(slug)!, raw));
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

export function buildWeightsRecord(models: unknown): Record<string, boolean> {
  const record: Record<string, boolean> = Object.create(null);
  if (!Array.isArray(models)) return record;
  for (const raw of models) {
    if (!isRecord(raw)) continue;
    const m = raw as Partial<ArtificialAnalysisModel>;
    if (typeof m.is_open_weights !== "boolean") continue;
    if (typeof m.slug === "string" && m.slug) record[m.slug] = m.is_open_weights;
    if (typeof m.id === "string" && m.id && m.id !== m.slug) record[m.id] = m.is_open_weights;
  }
  return record;
}

function matchMeta(m: ArtificialAnalysisModel, meta: Record<string, ModelMetaEntry>): ModelMetaEntry | undefined {
  const keys: string[] = [];
  for (const raw of [m.slug, m.name, m.short_name]) {
    if (typeof raw !== "string" || !raw) continue;
    const key = normalizeModelKey(raw);
    if (key) keys.push(key);
  }
  let looseHit: ModelMetaEntry | undefined;
  for (const key of keys) {
    if (!Object.hasOwn(meta, key)) continue;
    const e = meta[key];
    if (!isRecord(e)) continue;
    const entry = e as ModelMetaEntry;
    if (entry.intelligenceIndex != null || entry.agenticIndex != null) return entry;
    looseHit ??= entry;
  }
  if (looseHit) return looseHit;
  for (const key of keys) {
    const stripped = key.replace(/\d{4,8}$/, "");
    if (stripped && stripped !== key && Object.hasOwn(meta, stripped)) {
      const e = meta[stripped];
      if (isRecord(e)) return e as ModelMetaEntry;
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
