import type { OpenRouterRankEntry } from "@/shared/types";

export const USAGE_CATEGORY_ORDER = ["coding", "reasoning", "general"] as const;

export interface UsageSlice {
  key: (typeof USAGE_CATEGORY_ORDER)[number];
  total: number;
}

type UsageEntry = Pick<OpenRouterRankEntry, "category">;

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
