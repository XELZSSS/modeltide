import type { OpenRouterRankEntry } from "@/shared/types";

/** Fixed slice order: keeps colors + legend stable across renders/locales. */
export const USAGE_CATEGORY_ORDER = ["coding", "reasoning", "general"] as const;

export interface UsageSlice {
  key: (typeof USAGE_CATEGORY_ORDER)[number];
  total: number;
}

type UsageEntry = Pick<OpenRouterRankEntry, "category">;

/**
 * Count ranked models per task category and express each as a share of the
 * total. Count-based (not token-weighted): token sums are heavy-tailed and
 * let one general-purpose giant fill the whole pie, while counts keep all
 * three slices visible. Empty categories are dropped; order is always
 * coding/reasoning/general.
 */
export function aggregateUsageByCategory(entries: UsageEntry[]): { slices: UsageSlice[]; total: number } {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    const key = entry.category;
    if (key !== "coding" && key !== "reasoning" && key !== "general") continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const slices = USAGE_CATEGORY_ORDER.flatMap((key) => {
    const total = counts.get(key) ?? 0;
    return total > 0 ? [{ key, total }] : [];
  });
  return { slices, total: slices.reduce((sum, s) => sum + s.total, 0) };
}
