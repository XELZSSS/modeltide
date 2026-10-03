import { hasCatalogIdentity, isRecord, obj, str } from "@/server/parsers/parser-primitives";
import type { ArtificialAnalysisModel } from "@/shared/types";
import { MAX_DIRECTORY_ROWS } from "@/server/config/limits";
import { normalizeModelKey } from "@/shared/utils";
import type { ModelMetaEntry } from "@/server/parsers/upstream-types";

const PROTO_KEYS = new Set(["__proto__", "constructor", "prototype"]);

const TRAILING_VERSION_DIGITS_RE = /\d{4,8}$/;

function mergeEntry(cur: Record<string, unknown>, patch: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(patch)) {
    if (PROTO_KEYS.has(key)) continue;
    if (value !== null && value !== undefined && value !== "") cur[key] = value;
  }
  if (cur.omniscienceBreakdown && patch.omniscienceBreakdown) {
    const next: Record<string, unknown> = { ...obj(cur.omniscienceBreakdown) };
    for (const [key, value] of Object.entries(obj(patch.omniscienceBreakdown) ?? {})) {
      if (PROTO_KEYS.has(key)) continue;
      if (value !== null && value !== undefined && value !== "") next[key] = value;
    }
    cur.omniscienceBreakdown = next;
  }
}

export function mergeBySlug(catalog: unknown, ...enrich: unknown[]): Record<string, unknown>[] {
  const merged = new Map<string, Record<string, unknown>>();
  const catalogArr = Array.isArray(catalog) ? catalog.slice(0, MAX_DIRECTORY_ROWS) : [];
  for (const raw of catalogArr) {
    if (!isRecord(raw) || !hasCatalogIdentity(raw)) continue;
    const slug = str(raw.slug);
    if (!merged.has(slug)) merged.set(slug, { ...raw });
  }
  for (const group of enrich) {
    if (!Array.isArray(group)) continue;
    for (const raw of (group as unknown[]).slice(0, MAX_DIRECTORY_ROWS)) {
      if (!isRecord(raw)) continue;
      const slug = str(raw.slug);
      if (!slug) continue;
      const current = merged.get(slug);
      if (current === undefined) continue;
      mergeEntry(current, raw);
    }
  }
  return [...merged.values()];
}

export interface IntelligenceIndexResult {
  models: ArtificialAnalysisModel[];
  enrichFailed: boolean;
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
    const stripped = key.replace(TRAILING_VERSION_DIGITS_RE, "");
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
        m.agentic_index = entry.agenticIndex;
        filled++;
      }
    }
  }
  return filled;
}
