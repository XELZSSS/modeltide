import { computed, toValue, type ComputedRef, type MaybeRefOrGetter } from "vue";
import type { TFunction } from "@/shared/i18n";
import type { TextToImageModel } from "@/shared/types";
import type { NormalizedHomeDashboard } from "@/client/api/payload-normalize";
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

/**
 * The dashboard payload already carries the top-N slices the home cards need, so this hook only
 * formats them. Keeping the aggregation server-side is what lets `/` skip the full AA index.
 */
export function useHomeStats(dashboardData: MaybeRefOrGetter<NormalizedHomeDashboard>, t: TFunction): HomeStats {
  const t2iModels = computed(() => toValue(dashboardData).textToImage);

  const trendingStats = computed<HomeBarStat[]>(() =>
    topRows(toValue(dashboardData).opensource, (model) => ({
      label: shortModelId(model.id),
      value: model.downloads,
      valueLabel: formatShortNumber(model.downloads, t("notAvailable")),
    })),
  );

  const hallucinationStats = computed<HomeBarStat[]>(() =>
    topRows(toValue(dashboardData).hallucinations, (entry) => ({
      label: entry.model,
      value: entry.accuracy,
      valueLabel: `${entry.accuracy.toFixed(1)}%`,
    })),
  );

  const providerStats = computed<HomeProviderStat[]>(() =>
    toValue(dashboardData).providers.map(({ name, color, avgSpeed }) => ({
      // The server leaves the unknown-provider label blank so it can be translated here.
      name: name || t("unknown"),
      color,
      avgSpeed,
    })),
  );

  return { trendingStats, hallucinationStats, providerStats, t2iModels };
}
