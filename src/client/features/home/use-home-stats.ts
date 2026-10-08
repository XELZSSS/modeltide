import { computed, toValue, type ComputedRef, type MaybeRefOrGetter } from "vue";
import type { TFunction } from "@/shared/i18n";
import type { ArtificialAnalysisModel, HallucinationRankingEntry, TextToImageModel } from "@/shared/types";
import type { NormalizedHomeDashboard } from "@/client/api/payload-normalize";
import { computeProviderStats, shortModelId } from "@/shared/utils/models";
import { formatShortNumber } from "@/client/utils/format";
import { emptyArray } from "@/client/utils/empty";

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

const top7 = <T>(items: T[], map: (item: T) => HomeBarStat): HomeBarStat[] => items.slice(0, 7).map(map);

export interface HomeStats {
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
  const t2iModels = computed(() => toValue(dashboardData).textToImage ?? emptyArray<TextToImageModel>());

  const trendingStats = computed<HomeBarStat[]>(() =>
    top7(toValue(dashboardData).opensource, (model) => ({
      label: shortModelId(model.id),
      value: model.downloads,
      valueLabel: formatShortNumber(model.downloads, t("notAvailable")),
    })),
  );

  const hallucinationStats = computed<HomeBarStat[]>(() =>
    top7(
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

  const providerStats = computed<HomeProviderStat[]>(() =>
    computeProviderStats(toValue(artificialData), t("unknown"))
      .filter((p): p is typeof p & { avgSpeed: number } => p.avgSpeed != null)
      .map(({ name, color, avgSpeed }) => ({ name, color, avgSpeed }))
      .sort((a, b) => b.avgSpeed - a.avgSpeed),
  );

  return { trendingStats, hallucinationStats, providerStats, t2iModels };
}
