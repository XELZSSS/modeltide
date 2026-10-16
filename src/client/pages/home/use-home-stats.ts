import { computed, toValue, type ComputedRef, type MaybeRefOrGetter } from "vue";
import type { TFunction } from "@/shared/i18n";
import type { ArtificialAnalysisModel, HallucinationRankingEntry, TextToImageModel } from "@/shared/types";
import type { NormalizedHomeDashboard } from "@/client/api/payload-normalize";
import { useProviderStats } from "@/client/pages/rankings/provider-stats";
import { shortModelId } from "@/shared/utils/models";
import { formatShortNumber } from "@/shared/utils";

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

const TOP_ROWS = 5;

const topRows = <T>(items: T[], map: (item: T) => HomeBarStat): HomeBarStat[] => items.slice(0, TOP_ROWS).map(map);

interface HomeStats {
  trendingStats: ComputedRef<HomeBarStat[]>;
  hallucinationStats: ComputedRef<HomeBarStat[]>;
  providerStats: ComputedRef<HomeProviderStat[]>;
  t2iModels: ComputedRef<TextToImageModel[]>;
}

export function useHomeStats(
  artificialData: MaybeRefOrGetter<ArtificialAnalysisModel[]>,
  hallucinationRankings: MaybeRefOrGetter<HallucinationRankingEntry[]>,
  dashboardData: MaybeRefOrGetter<NormalizedHomeDashboard>,
  t: TFunction,
): HomeStats {
  const t2iModels = computed(() => toValue(dashboardData).textToImage);

  const trendingStats = computed<HomeBarStat[]>(() =>
    topRows(toValue(dashboardData).opensource, (model) => ({
      label: shortModelId(model.id),
      value: model.downloads,
      valueLabel: formatShortNumber(model.downloads, t("notAvailable")),
    })),
  );

  const hallucinationStats = computed<HomeBarStat[]>(() =>
    topRows(
      toValue(hallucinationRankings).filter(
        (entry): entry is HallucinationRankingEntry & { accuracy: number } => entry.accuracy != null,
      ),
      (entry) => ({
        label: entry.model,
        value: entry.accuracy,
        valueLabel: `${entry.accuracy.toFixed(1)}%`,
      }),
    ),
  );

  // Delegate to useProviderStats so the home card and the provider-compare tab
  // share one sort definition (by average speed, highest first) instead of each
  // applying its own ordering.
  const providerStats = computed<HomeProviderStat[]>(() =>
    useProviderStats(artificialData, t, "speed")
      .value.filter((p): p is typeof p & { avgSpeed: number } => p.avgSpeed != null)
      .map(({ name, color, avgSpeed }) => ({ name, color, avgSpeed })),
  );

  return { trendingStats, hallucinationStats, providerStats, t2iModels };
}
