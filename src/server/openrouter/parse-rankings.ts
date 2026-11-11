import { numOr } from "@/server/formats/scalars";
import type { OpenRouterRankEntry } from "@/shared/types";
import { categoryFrom, creatorFromSlug, titleFromSlug } from "./naming";
import { isRetiredRankEntry, todayIso } from "@/shared/config/time";
import type { PricingEntry } from "./directory-pricing";
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

/** One group as `compareRanked` sorts it: `RankingGroup` is private in `aggregate.ts`, so the shape comes from the comparator rather than a second declaration. */
type RankedGroup = Parameters<typeof compareRanked>[0];

/** A model is free only when every leg its price states is zero: a `null` leg is the upstream's `-1` ("not applicable") after coercion, so only a quoted leg can make it paid. */
function isFreePricing(pricing: PricingEntry | undefined): boolean {
  if (pricing === undefined) return false;
  return (
    pricing.input === 0 &&
    pricing.output === 0 &&
    (pricing.cacheHit == null || pricing.cacheHit === 0) &&
    (pricing.cacheWrite == null || pricing.cacheWrite === 0)
  );
}

/** One ranked group as the payload row, or `null` when the directory retired it before `today`. Expiry is resolved before the price: a retired model needs no price. */
function rankEntry(
  ranked: RankedGroup,
  pricing: PricingLookup,
  meta: MetaLookup | undefined,
  today: string,
): OpenRouterRankEntry | null {
  const { agg: row, dominant, latest } = ranked.group;
  const id = row.model_permaslug;
  const variantKey = dominant.variant_permaslug;
  const expiresAt = resolveExpiry(meta, id, variantKey);
  if (isRetiredRankEntry(expiresAt, today)) return null;
  const name = titleFromSlug(id) || id;
  const resolved = resolvePricing(pricing, id, variantKey);
  // Each wire count is read once: `numOr` coerces (and `totalTokens` is the sum of the other two).
  const promptTokens = numOr(row.total_prompt_tokens);
  const completionTokens = numOr(row.total_completion_tokens);
  return {
    id,
    name,
    creator: creatorFromSlug(id),
    category: categoryFrom(id, name),
    variant: dominant.variant || null,
    totalTokens: promptTokens + completionTokens,
    promptTokens,
    completionTokens,
    requestCount: numOr(row.count),
    change: changeToPercent(latest.change),
    pricing: resolved ?? null,
    isFree: isFreePricing(resolved),
    expiresAt,
  };
}

/** The rankings payload as rows: group by model, order the groups, then map each onto an entry. Retirement is the only thing that removes a row, and it is counted here (`expiredRows`), not in `groupRows`. */
export function mapModels(
  rows: readonly unknown[],
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
  for (const group of ranked) {
    const entry = rankEntry(group, pricing, meta, today);
    if (entry === null) {
      if (stats) stats.expiredRows += 1;
      continue;
    }
    out.push(entry);
  }
  return out;
}
