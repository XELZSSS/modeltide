import { computed, toValue, type MaybeRefOrGetter } from "vue";
import type { TFunction } from "@/shared/i18n";
import type { ArtificialAnalysisModel } from "@/shared/types";
import { computeProviderStats, type ProviderStats } from "@/shared/utils/models";

/**
 * Provider rows in the order `computeProviderStats` returns them, which is by model count. Ordering by average speed
 * used to be an option here and had no production caller, so the table shows the source order instead.
 */
export function useProviderStats(models: MaybeRefOrGetter<ArtificialAnalysisModel[]>, t: TFunction) {
  return computed<ProviderStats[]>(() => computeProviderStats(toValue(models), t("unknown")));
}
