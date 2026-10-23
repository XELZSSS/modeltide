import { numOr } from "@/server/formats/scalars";
import type { OpenRouterRankEntry } from "@/shared/types";
import { categoryFrom, creatorFromSlug, titleFromSlug } from "./naming";
import {
  compareRanked,
  changePercent,
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
  const today = new Date().toISOString().slice(0, 10);
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
    const variantKey = typeof dominant.variant_permaslug === "string" ? dominant.variant_permaslug : undefined;
    const expiresAt = resolveExpiry(meta, id, variantKey);
    if (expiresAt != null && expiresAt <= today) {
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
      variant: typeof dominant.variant === "string" && dominant.variant ? dominant.variant : null,
      totalTokens: numOr(row.total_prompt_tokens, 0) + numOr(row.total_completion_tokens, 0),
      promptTokens: numOr(row.total_prompt_tokens, 0),
      completionTokens: numOr(row.total_completion_tokens, 0),
      reasoningTokens: numOr(row.total_native_tokens_reasoning, 0),
      cachedTokens: numOr(row.total_native_tokens_cached, 0),
      toolCalls: numOr(row.total_tool_calls, 0),
      requestCount: numOr(row.count, 0),
      change: changePercent(latest.change),
      pricing: resolved ?? null,
      isFree,
      expiresAt,
    });
  }
  return out;
}
