import { isRecord, isValidRowId, numCoerce, parseTs } from "@/server/formats/parser-primitives";
import { MAX_DIRECTORY_ROWS } from "@/server/formats/limits";
import { pruneBounded } from "@/server/util/throttle";
import { normalizeModelKey } from "@/shared/utils";

import type { ModelMetaEntry, ModelRow } from "@/server/formats/wire-types";
import type { PricingEntry } from "./parse-directory";

const SUM_KEYS = [
  "total_prompt_tokens",
  "total_completion_tokens",
  "total_native_tokens_reasoning",
  "total_native_tokens_cached",
  "count",
  "total_tool_calls",
] as const;

function usageTotal(row: ModelRow): number {
  const rec = row as unknown as Record<string, unknown>;
  const p = numCoerce(rec?.total_prompt_tokens);
  const c = numCoerce(rec?.total_completion_tokens);
  if (p == null && c == null) return -1;
  return (p ?? 0) + (c ?? 0);
}

function rankingMetric(row: ModelRow): number | null {
  return numCoerce((row as unknown as Record<string, unknown>).rankingMetricValue);
}

interface Group {
  agg: ModelRow;
  dominant: ModelRow;
  dominantTokens: number;
  latest: ModelRow;
  latestTs: number;
  latestTokens: number;
  metric: number | null;
}

// Upstream `change` is a ratio (0.005 = +0.5%) but percent values also appear; |v| < 1 means ratio.
function changePercent(value: unknown): number | null {
  const n = numCoerce(value);
  if (n == null) return null;
  return Math.abs(n) < 1 ? n * 100 : n;
}

export type PricingLookup = Map<string, PricingEntry> | Record<string, PricingEntry>;

function lookupPricing(pricing: PricingLookup, key: string): PricingEntry | undefined {
  if (pricing instanceof Map) return pricing.get(key);
  return Object.hasOwn(pricing, key) ? pricing[key] : undefined;
}

// Memoized: normalizeModelKey costs far more than a lowercase pass and rows repeat the same slugs.
const NORMALIZED_KEY_CACHE_MAX = 8192;
const normalizedKeyCache = new Map<string, string>();

function normalizeKeyCached(raw: string): string {
  let normalized = normalizedKeyCache.get(raw);
  if (normalized === undefined) {
    normalized = normalizeModelKey(raw);
    normalizedKeyCache.set(raw, normalized);
    pruneBounded(normalizedKeyCache, NORMALIZED_KEY_CACHE_MAX, () => false);
  }
  return normalized;
}

function resolvePricing(pricing: PricingLookup, id: string, variantKey: string | undefined): PricingEntry | undefined {
  const keys = [variantKey, id].filter((k): k is string => typeof k === "string" && k !== "");
  const candidates = [
    ...keys.map((key) => key.toLowerCase()),
    ...keys.map(normalizeKeyCached).filter((key): key is string => key !== ""),
  ];
  for (const key of candidates) {
    const hit = lookupPricing(pricing, key);
    if (hit) return hit;
  }
  return undefined;
}

export interface RankingScanStats {
  scannedRows: number;
  validRows: number;
}

export type MetaLookup = Map<string, ModelMetaEntry> | Record<string, ModelMetaEntry>;

/** Scheduled retirement date for `id` (or its variant), resolved with the pricing lookup's keys. */
export function resolveExpiry(meta: MetaLookup | undefined, id: string, variantKey: string | undefined): string | null {
  if (!meta) return null;
  const keys = [variantKey, id].filter((k): k is string => typeof k === "string" && k !== "");
  const candidates = [...keys.map((key) => key.toLowerCase()), ...keys.map(normalizeKeyCached)];
  for (const key of candidates) {
    const hit = meta instanceof Map ? meta.get(key) : Object.hasOwn(meta, key) ? meta[key] : undefined;
    if (hit?.expiresAt) return hit.expiresAt;
  }
  return null;
}

function groupRows(rows: unknown, stats?: RankingScanStats): Map<string, Group> {
  const grouped = new Map<string, Group>();
  if (!Array.isArray(rows)) return grouped;
  const count = Math.min(rows.length, MAX_DIRECTORY_ROWS);
  let valid = 0;
  for (let i = 0; i < count; i++) {
    const raw: unknown = rows[i];
    if (!isRecord(raw)) continue;
    const idRaw = (raw as unknown as ModelRow).model_permaslug;
    if (!isValidRowId(idRaw)) continue;
    valid += 1;
    const row = raw as unknown as ModelRow;
    const id = (idRaw as string).trim();
    const tokens = usageTotal(row);
    const ts = parseTs(row.date);
    const metric = rankingMetric(row);
    const group = grouped.get(id);
    if (!group) {
      grouped.set(id, {
        agg: { ...row, model_permaslug: id },
        dominant: row,
        dominantTokens: tokens,
        latest: row,
        latestTs: ts,
        latestTokens: tokens,
        metric,
      });
      continue;
    }
    const agg = group.agg;
    for (const k of SUM_KEYS) {
      const cur = numCoerce(agg[k]);
      const add = numCoerce(row[k]);
      if (cur == null && add == null) continue;
      agg[k] = (cur ?? 0) + (add ?? 0);
    }
    if (tokens > group.dominantTokens) {
      group.dominant = row;
      group.dominantTokens = tokens;
    }
    if (ts > group.latestTs || (ts === group.latestTs && tokens > group.latestTokens)) {
      group.latest = row;
      group.latestTs = ts;
      group.latestTokens = tokens;
    }
    if (metric != null && (group.metric == null || metric > group.metric)) group.metric = metric;
  }
  if (stats) {
    stats.scannedRows = count;
    stats.validRows = valid;
  }
  return grouped;
}

interface RankedGroup {
  group: Group;
  derivedTokens: number;
}

function compareRanked(a: RankedGroup, b: RankedGroup): number {
  const am = a.group.metric;
  const bm = b.group.metric;
  if (am !== bm) {
    if (am == null) return 1;
    if (bm == null) return -1;
    return bm - am;
  }
  if (a.derivedTokens !== b.derivedTokens) return b.derivedTokens - a.derivedTokens;
  const aid = a.group.agg.model_permaslug;
  const bid = b.group.agg.model_permaslug;
  return aid === bid ? 0 : aid < bid ? -1 : 1;
}

export { groupRows, compareRanked, usageTotal, resolvePricing, changePercent };
