import { isRecord, numCoerce } from "@/server/formats/scalars";
import { parseTs } from "@/server/formats/dates";
import { isValidRowId } from "@/server/formats/content-guards";
import { isModelRow } from "@/server/formats/wire-guards";
import { MAX_RANKING_ROWS } from "@/server/formats/limits";
import { lookupHit, modelKeyCandidates, type Lookup } from "./lookup";

import type { ModelMetaEntry, ModelRow } from "@/server/formats/wire-types";
import type { PricingEntry } from "./parse-directory";

const SUM_KEYS = ["total_prompt_tokens", "total_completion_tokens", "count"] as const;

function usageTotal(row: ModelRow): number {
  const p = numCoerce(row.total_prompt_tokens);
  const c = numCoerce(row.total_completion_tokens);
  if (p == null && c == null) return -1;
  return (p ?? 0) + (c ?? 0);
}

function rankingMetric(row: ModelRow): number | null {
  return numCoerce(row.rankingMetricValue);
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

/**
 * Converts the upstream `change` figure to percent. The payload has been observed in both forms: a ratio (`-0.9`, i.e.
 * -90%) and an already-percent number (`1`, i.e. 1%). Magnitude tells them apart — every ratio the feed emits is below 1
 * in absolute value — and that is the single heuristic this pipeline relies on. `parse-rankings.test.ts` pins both
 * cases, so a change in upstream meaning fails the suite instead of quietly scaling every trend by 100.
 *
 * One figure cannot say which form it is in, so the two counts are recorded on the scan stats: a payload that needed
 * both readings is the signature of an upstream mid-change, and the ranking's own numbers are then scaled by two
 * different factors. `rankings.ts` reports it. A ratio above 1 (+150% over a period) also lands in the percent count,
 * so this is a signal to go look at, not a verdict.
 */
function changeToPercent(value: unknown, stats?: RankingScanStats): number | null {
  const n = numCoerce(value);
  if (n == null) return null;
  if (Math.abs(n) < 1) {
    if (stats) stats.ratioFormChanges += 1;
    return n * 100;
  }
  if (stats) stats.percentFormChanges += 1;
  return n;
}

export type PricingLookup = Lookup<PricingEntry>;

function resolvePricing(pricing: PricingLookup, id: string, variantKey: string | undefined): PricingEntry | undefined {
  for (const key of modelKeyCandidates([variantKey, id])) {
    const hit = lookupHit(pricing, key);
    if (hit) return hit;
  }
  return undefined;
}

export interface RankingScanStats {
  scannedRows: number;
  validRows: number;
  expiredRows: number;
  ratioFormChanges: number;
  percentFormChanges: number;
}

export type MetaLookup = Lookup<ModelMetaEntry>;

export function resolveExpiry(meta: MetaLookup | undefined, id: string, variantKey: string | undefined): string | null {
  if (!meta) return null;
  for (const key of modelKeyCandidates([variantKey, id])) {
    const hit = lookupHit(meta, key);
    if (hit?.expiresAt) return hit.expiresAt;
  }
  return null;
}

function groupRows(rows: unknown, stats?: RankingScanStats): Map<string, Group> {
  const grouped = new Map<string, Group>();
  if (!Array.isArray(rows)) return grouped;
  const count = Math.min(rows.length, MAX_RANKING_ROWS);
  let valid = 0;
  for (let i = 0; i < count; i++) {
    const raw: unknown = rows[i];
    if (!isRecord(raw)) continue;
    if (!isModelRow(raw) || !isValidRowId(raw.model_permaslug)) continue;
    valid += 1;
    const row = raw;
    const id = row.model_permaslug.trim();
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
  // `groupRows` owns the counters it is the only producer of: `scannedRows` and `validRows` are read straight off the
  // rows it just walked. `expiredRows` is not one of them — `mapModels` counts retired groups after this returns — so
  // resetting it here made the count depend on call order instead of on what the scan found.
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

export { groupRows, compareRanked, usageTotal, resolvePricing, changeToPercent };
