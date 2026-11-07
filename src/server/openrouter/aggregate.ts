import { isRecord, numCoerce } from "@/server/formats/scalars";
import { parseTs } from "@/server/formats/dates";
import { isValidRowId } from "@/server/formats/content-guards";
import { isOrRankingRow } from "./wire";
import { MAX_RANKING_ROWS } from "@/server/formats/limits";
import { fillModelKeys, lookupHit, type Lookup } from "./lookup";

import type { OrMetaEntry, OrRankingRow } from "./wire";
import type { PricingEntry } from "./parse-directory";

const SUM_KEYS = ["total_prompt_tokens", "total_completion_tokens", "count"] as const;

/** `-1` marks a row whose usage counters are both absent, so it can never win a dominant-row comparison. */
function usageTotal(row: OrRankingRow): number {
  const p = numCoerce(row.total_prompt_tokens);
  const c = numCoerce(row.total_completion_tokens);
  return p == null && c == null ? -1 : (p ?? 0) + (c ?? 0);
}

interface Group {
  agg: OrRankingRow;
  dominant: OrRankingRow;
  dominantTokens: number;
  latest: OrRankingRow;
  latestTs: number;
  latestTokens: number;
  metric: number | null;
}

/**
 * Converts the upstream `change` figure to percent.
 *
 * `change` is a **ratio** on every row: OpenRouter's own rankings page prints this column as `change * 100`, and a
 * live probe of `/api/frontend/v1/rankings/models` reproduced that exactly (change `2.6249` renders as `+262%`,
 * `77.2504` as `>999%`, `0.9562` as `+96%`). The payload therefore carries no unit ambiguity to resolve: a ratio
 * above 1 is a genuine growth of over 100% over the seven-day window, not a percent figure.
 *
 * The previous implementation read `Math.abs(n) < 1` as a ratio and anything above it as an already-percent number.
 * On the live payload that misread 65 of 588 rows — every model that grew more than 100%, the very rows a ranking
 * page exists to surface, printed at a hundredth of their real growth (`2.6249` showed as `2.6%` instead of `262%`).
 */
function changeToPercent(value: unknown): number | null {
  const n = numCoerce(value);
  return n == null ? null : n * 100;
}

export type PricingLookup = Lookup<PricingEntry>;

/**
 * The key forms of the group being resolved. Reused, because `modelKeyCandidates` built a Set, a `present` array and a
 * spread array per call, and the rankings resolve pricing and expiry for every group (≈1,200 lookups a refresh). Safe as
 * module state: both resolvers run synchronously, one after the other, inside `mapModels`.
 */
const candidateKeys = new Set<string>();

function resolvePricing(pricing: PricingLookup, id: string, variantKey: string | undefined): PricingEntry | undefined {
  fillModelKeys(candidateKeys, [variantKey, id]);
  for (const key of candidateKeys) {
    const hit = lookupHit(pricing, key);
    if (hit) return hit;
  }
  return undefined;
}

export interface RankingScanStats {
  validRows: number;
  expiredRows: number;
}

export type MetaLookup = Lookup<OrMetaEntry>;

export function resolveExpiry(meta: MetaLookup | undefined, id: string, variantKey: string | undefined): string | null {
  if (!meta) return null;
  fillModelKeys(candidateKeys, [variantKey, id]);
  for (const key of candidateKeys) {
    const hit = lookupHit(meta, key);
    if (hit?.expiresAt) return hit.expiresAt;
  }
  return null;
}

function groupRows(rows: readonly unknown[], stats?: RankingScanStats): Map<string, Group> {
  const grouped = new Map<string, Group>();
  // `rankings.ts` proves the body is an array with `requireArrayBody` before these rows get here, so the empty-map
  // branch this line used to be answered only a body the caller had already rejected.
  const count = Math.min(rows.length, MAX_RANKING_ROWS);
  let valid = 0;
  for (let i = 0; i < count; i++) {
    const raw: unknown = rows[i];
    if (!isRecord(raw)) continue;
    if (!isOrRankingRow(raw) || !isValidRowId(raw.model_permaslug)) continue;
    valid += 1;
    const row = raw;
    const id = row.model_permaslug.trim();
    const tokens = usageTotal(row);
    const ts = parseTs(row.date);
    const metric = numCoerce(row.rankingMetricValue);
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
  // `validRows` is the one counter `groupRows` is the only producer of. `expiredRows` is not — `mapModels` counts
  // retired groups after this returns — so resetting it here made the count depend on call order instead of on what the
  // scan found.
  if (stats) stats.validRows = valid;
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
  if (aid === bid) return 0;
  if (aid < bid) return -1;
  return 1;
}

export { groupRows, compareRanked, usageTotal, resolvePricing, changeToPercent };
