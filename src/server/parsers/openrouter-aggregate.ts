import { isRecord, isValidRowId, numCoerce, parseTs } from "@/server/parsers/parser-primitives";
import { MAX_DIRECTORY_ROWS } from "@/server/config/limits";
import { normalizeModelKey } from "@/shared/utils";

import type { ModelRow } from "@/server/parsers/upstream-types";
import type { PricingEntry } from "@/server/parsers/openrouter-directory-parser";

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

function changePercent(value: unknown): number | null {
  const n = numCoerce(value);
  return n == null ? null : n * 100;
}

export type PricingLookup = Map<string, PricingEntry> | Record<string, PricingEntry>;

function lookupPricing(pricing: PricingLookup, key: string): PricingEntry | undefined {
  if (pricing instanceof Map) return pricing.get(key);
  return Object.hasOwn(pricing, key) ? pricing[key] : undefined;
}

function resolvePricing(pricing: PricingLookup, id: string, variantKey: string | undefined): PricingEntry | undefined {
  const keys = [variantKey, id].filter((k): k is string => typeof k === "string" && k !== "");
  for (const key of keys) {
    const hit = lookupPricing(pricing, key.toLowerCase());
    if (hit) return hit;
  }
  for (const key of keys) {
    const normalized = normalizeModelKey(key);
    if (!normalized) continue;
    const hit = lookupPricing(pricing, normalized);
    if (hit) return hit;
  }
  return undefined;
}

export interface RankingScanStats {
  scannedRows: number;
  validRows: number;
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
    for (const k of SUM_KEYS) {
      const cur = numCoerce(group.agg[k]);
      const add = numCoerce(row[k]);
      if (cur == null && add == null) continue;
      group.agg[k] = (cur ?? 0) + (add ?? 0);
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
