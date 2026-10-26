import { numOr } from "@/server/formats/scalars";
import type { OpenRouterRankEntry } from "@/shared/types";
import { categoryFrom, creatorFromSlug, titleFromSlug } from "./naming";
import { isRetiredRankEntry, todayIso } from "@/shared/config/time";
import {
  compareRanked,
  changeToPercent,
  groupRows,
  resolveExpiry,
  resolvePricing,
  usageTotal,
  type MetaLookup,
  type PricingLookup,
  type RankingScanStats,
} from "./aggregate";

export type { RankingScanStats };

export function mapModels(
  rows: unknown,
  pricing: PricingLookup,
  stats?: RankingScanStats,
  meta?: MetaLookup,
): OpenRouterRankEntry[] {
  const today = todayIso();
  const ranked = Array.from(groupRows(rows, stats).values()).map((group) => ({
    group,
    derivedTokens: usageTotal(group.agg),
  }));
  ranked.sort(compareRanked);
  const out: OpenRouterRankEntry[] = [];
  for (let i = 0; i < ranked.length; i++) {
    const { agg: row, dominant, latest } = ranked[i]!.group;
    const id = row.model_permaslug;
    const name = titleFromSlug(id) || id;
    const variantKey = dominant.variant_permaslug;
    const expiresAt = resolveExpiry(meta, id, variantKey);
    if (isRetiredRankEntry(expiresAt, today)) {
      if (stats) stats.expiredRows += 1;
      continue;
    }
    const resolved = resolvePricing(pricing, id, variantKey);
    const isFree = resolved
      ? resolved.input === 0 &&
        resolved.output === 0 &&
        (resolved.cacheHit == null || resolved.cacheHit === 0) &&
        (resolved.cacheWrite == null || resolved.cacheWrite === 0)
      : false;
    out.push({
      id,
      name,
      creator: creatorFromSlug(id),
      category: categoryFrom(id, name),
      variant: dominant.variant || null,
      totalTokens: numOr(row.total_prompt_tokens) + numOr(row.total_completion_tokens),
      promptTokens: numOr(row.total_prompt_tokens),
      completionTokens: numOr(row.total_completion_tokens),
      requestCount: numOr(row.count),
      change: changeToPercent(latest.change, stats),
      pricing: resolved ?? null,
      isFree,
      expiresAt,
    });
  }
  return out;
}
