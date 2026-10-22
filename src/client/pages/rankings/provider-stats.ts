import { computed, toValue, type MaybeRefOrGetter } from "vue";
import type { TFunction } from "@/shared/i18n";
import type { ArtificialAnalysisModel } from "@/shared/types";
import { computeProviderStats, type ProviderStats } from "@/shared/utils/models";

type ProviderSortBy = "count" | "speed";

export function useProviderStats(
  models: MaybeRefOrGetter<ArtificialAnalysisModel[]>,
  t: TFunction,
  sortBy: ProviderSortBy = "count",
) {
  return computed<ProviderStats[]>(() => {
    const stats = computeProviderStats(toValue(models), t("unknown"));
    if (sortBy === "speed") {
      const speedOf = (provider: ProviderStats) => provider.avgSpeed ?? -Infinity;
      return [...stats].sort((a, b) => speedOf(b) - speedOf(a) || a.name.localeCompare(b.name));
    }
    return stats;
  });
}
