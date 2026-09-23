import {
  hasCatalogIdentity,
  isNonEmptyString,
  isRecord,
  numCoerce,
  obj,
  str,
} from "@/server/parsers/parser-primitives";
import type { ArtificialAnalysisModel } from "@/shared/types";
import { normalizeModelKey } from "@/shared/utils";
import { traverse } from "@/server/parsers/rsc-parser";
import type { ModelMetaEntry } from "@/server/parsers/upstream-types";

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

/** Picks `initialModels`/`models`, preferring whichever carries `intelligenceIndex` rows. */
export function findModelArray(tree: unknown): Record<string, unknown>[] | null {
  let initialModels: Record<string, unknown>[] | null = null;
  let models: Record<string, unknown>[] | null = null;
  for (const node of traverse(tree)) {
    const rec = node as Record<string, unknown>;
    if (!initialModels && Array.isArray(rec.initialModels)) {
      initialModels = rec.initialModels as Record<string, unknown>[];
    }
    if (!models && Array.isArray(rec.models)) models = rec.models as Record<string, unknown>[];
    if (initialModels && models) break;
  }
  let fallback: Record<string, unknown>[] | null = null;
  for (const arr of [initialModels, models]) {
    if (arr?.some((m) => isRecord(m) && "intelligenceIndex" in m)) return arr;
    if (!fallback && isModelArray(arr)) fallback = arr;
  }
  return fallback;
}

function isModelArray(arr: unknown): arr is Record<string, unknown>[] {
  return Array.isArray(arr) && arr.length >= 1 && arr.some((m) => isRecord(m) && isNonEmptyString(m.slug));
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

export function mergeBySlug(catalog: unknown, ...enrich: unknown[]): Record<string, unknown>[] {
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
  enrichFailed: boolean;
  /** Stamped once per upstream fetch so cache hits keep reporting the real refresh time. */
  fetchedAt: string;
}

function metaEntry(meta: Record<string, ModelMetaEntry>, key: string): ModelMetaEntry | undefined {
  if (!Object.hasOwn(meta, key)) return undefined;
  const e = meta[key];
  return isRecord(e) ? (e as ModelMetaEntry) : undefined;
}

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
    const e = metaEntry(meta, key);
    if (!e) continue;
    if (valued(e)) return e;
    looseHit ??= e;
  }
  if (looseHit) return looseHit;
  for (const key of keys) {
    const stripped = key.replace(/\d{4,8}$/, "");
    if (!stripped || stripped === key) continue;
    const e = metaEntry(meta, stripped);
    if (e) return e;
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
        // OpenRouter mirrors AA's indices on the same 0-100 scale, so this is a copy, not a conversion.
        m.agentic_index = entry.agenticIndex;
        filled++;
      }
    }
  }
  return filled;
}
