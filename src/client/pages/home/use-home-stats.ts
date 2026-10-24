import { computed, toValue, type ComputedRef, type MaybeRefOrGetter } from "vue";
import type { TFunction } from "@/shared/i18n";
import type { TextToImageModel } from "@/shared/types";
import type { NormalizedHomeDashboard } from "@/client/api/payload-normalize";
import { shortModelId } from "@/shared/utils/models";
import { formatPercent, formatShortNumber } from "@/shared/utils";

export interface HomeBarStat {
  label: string;
  value: number;
  valueLabel: string;
}

export interface HomeProviderStat {
  name: string;
  color: string;
  avgSpeed: number;
}

interface HomeStats {
  trendingStats: ComputedRef<HomeBarStat[]>;
  hallucinationStats: ComputedRef<HomeBarStat[]>;
  providerStats: ComputedRef<HomeProviderStat[]>;
  t2iModels: ComputedRef<TextToImageModel[]>;
}

/**
 * The dashboard payload already carries the top-N slices the home cards need and in the order they are drawn, so this
 * hook only formats them. Keeping the aggregation and the slice server-side is what lets `/` skip the full AA index.
 */
export function useHomeStats(dashboardData: MaybeRefOrGetter<NormalizedHomeDashboard>, t: TFunction): HomeStats {
  const t2iModels = computed(() => toValue(dashboardData).textToImage);

  const trendingStats = computed<HomeBarStat[]>(() =>
    toValue(dashboardData).opensource.map((model) => ({
      label: shortModelId(model.id),
      value: model.downloads,
      valueLabel: formatShortNumber(model.downloads, t("notAvailable")),
    })),
  );

  const hallucinationStats = computed<HomeBarStat[]>(() =>
    toValue(dashboardData).hallucinations.map((entry) => ({
      label: entry.name,
      value: entry.accuracy,
      valueLabel: formatPercent(entry.accuracy, t),
    })),
  );

  const providerStats = computed<HomeProviderStat[]>(() =>
    toValue(dashboardData).providers.map(({ name, color, avgSpeed }) => ({
      // `null` is the payload's way of saying "creator unknown"; the translated label can only come from here.
      name: name ?? t("unknown"),
      color,
      avgSpeed,
    })),
  );

  return { trendingStats, hallucinationStats, providerStats, t2iModels };
}
