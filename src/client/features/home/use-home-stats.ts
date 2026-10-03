import { computed, toValue, type ComputedRef, type MaybeRefOrGetter } from "vue";
import type { TFunction } from "@/shared/i18n";
import { BarChart3, Brain, Image, Rocket, type LucideIcon } from "@lucide/vue";
import type {
  ArtificialAnalysisModel,
  ClosedReleaseEntry,
  HallucinationRankingEntry,
  TextToImageModel,
} from "@/shared/types";
import type { NormalizedHomeDashboard } from "@/client/api/payload-normalize";
import { computeProviderStats, modelDisplayName, shortModelId } from "@/shared/utils/models";
import { formatShortNumber, orNA } from "@/client/utils/format";
import type { HomeBarStat } from "./statistics-section.vue";
import { EMPTY_ARRAY } from "@/client/utils/empty";

export interface HomeKpi {
  id: string;
  label: string;
  value: string;
  Icon: LucideIcon;
}

export interface HomeProviderStat {
  name: string;
  color: string;
  avgSpeed: number;
}

const top7 = <T>(items: T[], map: (item: T) => HomeBarStat): HomeBarStat[] => items.slice(0, 7).map(map);

function pickLatestReleaseName(closedReleases: ClosedReleaseEntry[]): string | null {
  let latestName: string | null = null;
  let latestDate: string | null = null;
  for (const entry of closedReleases) {
    if (latestDate === null || entry.releaseDate > latestDate) {
      latestDate = entry.releaseDate;
      latestName = entry.model;
    }
  }
  return latestName;
}

export interface HomeStats {
  trendingStats: ComputedRef<HomeBarStat[]>;
  hallucinationStats: ComputedRef<HomeBarStat[]>;
  kpiStrip: ComputedRef<HomeKpi[]>;
  providerStats: ComputedRef<HomeProviderStat[]>;
  t2iModels: ComputedRef<TextToImageModel[]>;
}

export function useHomeStats(
  artificialData: MaybeRefOrGetter<ArtificialAnalysisModel[]>,
  hallucinationRankings: MaybeRefOrGetter<HallucinationRankingEntry[]>,
  dashboardData: MaybeRefOrGetter<NormalizedHomeDashboard>,
  t: TFunction,
  closedReleases: MaybeRefOrGetter<ClosedReleaseEntry[]> = [],
): HomeStats {
  const t2iModels = computed(() => toValue(dashboardData).textToImage ?? EMPTY_ARRAY);

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

  const kpiStrip = computed<HomeKpi[]>(() => {
    const dashboard = toValue(dashboardData);
    const latestOpenRouterModel = dashboard.orRankings?.[0] ?? null;
    let bestReasoningModel: ArtificialAnalysisModel | null = null;
    for (const m of toValue(artificialData)) {
      if (
        m.is_reasoning === true &&
        (!bestReasoningModel ||
          (m.intelligence_index ?? -Infinity) > (bestReasoningModel.intelligence_index ?? -Infinity))
      ) {
        bestReasoningModel = m;
      }
    }
    return [
      {
        id: "or-top",
        label: t("openRouterRankings"),
        value: orNA(latestOpenRouterModel?.name, t),
        Icon: BarChart3,
      },
      { id: "t2i-top", label: t("bestT2IModel"), value: orNA(dashboard.textToImage?.[0]?.name, t), Icon: Image },
      {
        id: "latest",
        label: t("latestRelease"),
        value: orNA(pickLatestReleaseName(toValue(closedReleases)), t),
        Icon: Rocket,
      },
      {
        id: "reasoning",
        label: t("bestReasoningModel"),
        value: orNA(modelDisplayName(bestReasoningModel), t),
        Icon: Brain,
      },
    ];
  });

  const providerStats = computed<HomeProviderStat[]>(() =>
    computeProviderStats(toValue(artificialData), t("unknown"))
      .filter((p): p is typeof p & { avgSpeed: number } => p.avgSpeed != null)
      .map(({ name, color, avgSpeed }) => ({ name, color, avgSpeed }))
      .sort((a, b) => b.avgSpeed - a.avgSpeed),
  );

  return { trendingStats, hallucinationStats, kpiStrip, providerStats, t2iModels };
}
