import { useMemo } from "react";
import type { TranslationKey } from "@/shared/i18n";
import { BarChart3, Image, Lightbulb, Rocket, type LucideIcon } from "lucide-react";
import type { ArtificialAnalysisModel, HallucinationRankingEntry, HomeDashboardData } from "@/shared/types";
import { computeProviderStats, shortModelId } from "@/client/utils/model";
import { formatShortNumber } from "@/client/utils/format";
import type { HomeBarStat } from "./statistics-section";

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
  count: number;
}

export function useHomeStats(
  artificialData: ArtificialAnalysisModel[],
  hallucinationRankings: HallucinationRankingEntry[],
  dashboardData: HomeDashboardData,
  t: (key: TranslationKey, params?: Record<string, string | number>) => string,
) {
  const openSourceRankings = dashboardData.opensource ?? [];
  const t2iModels = useMemo(() => dashboardData.textToImage?.models ?? [], [dashboardData.textToImage?.models]);
  const latestOpenRouterModel = dashboardData.orRankings?.tokenUsageRankings?.[0] ?? null;

  const top7 = <T>(items: T[], map: (item: T) => HomeBarStat): HomeBarStat[] => items.slice(0, 7).map(map);

  const downloadStats = useMemo<HomeBarStat[]>(
    () =>
      top7(openSourceRankings, (model) => ({
        label: shortModelId(model.id),
        value: model.downloads,
        valueLabel: formatShortNumber(model.downloads),
      })),
    [openSourceRankings],
  );

  const hallucinationStats = useMemo<HomeBarStat[]>(
    () =>
      top7(
        hallucinationRankings.filter(
          (entry): entry is HallucinationRankingEntry & { accuracy: number } => entry.accuracy != null,
        ),
        (entry) => ({
          label: entry.model,
          value: entry.accuracy,
          valueLabel: `${entry.accuracy.toFixed(1)}%`,
        }),
      ),
    [hallucinationRankings],
  );

  const { latestRelease, bestReasoningModel } = useMemo(() => {
    let latest: ArtificialAnalysisModel | null = null;
    let latestTs = -Infinity;
    let bestReasoning: ArtificialAnalysisModel | null = null;
    for (const m of artificialData) {
      const ts = m.release_date ? Date.parse(m.release_date) : NaN;
      if (Number.isFinite(ts) && ts > latestTs) {
        latestTs = ts;
        latest = m;
      }
      if (
        m.is_reasoning === true &&
        (!bestReasoning || (m.intelligence_index ?? -Infinity) > (bestReasoning.intelligence_index ?? -Infinity))
      )
        bestReasoning = m;
    }
    return { latestRelease: latest, bestReasoningModel: bestReasoning };
  }, [artificialData]);

  const kpiStrip = useMemo<HomeKpi[]>(
    () => [
      {
        id: "or-top",
        label: t("openRouterRankings"),
        value: latestOpenRouterModel?.name || t("notAvailable"),
        Icon: BarChart3,
      },
      { id: "t2i-top", label: t("bestT2IModel"), value: t2iModels[0]?.name || t("notAvailable"), Icon: Image },
      {
        id: "latest",
        label: t("latestRelease"),
        value: latestRelease?.short_name || latestRelease?.name || t("notAvailable"),
        Icon: Rocket,
      },
      {
        id: "reasoning",
        label: t("bestReasoningModel"),
        value: bestReasoningModel?.short_name || bestReasoningModel?.name || t("notAvailable"),
        Icon: Lightbulb,
      },
    ],
    [t, latestOpenRouterModel?.name, t2iModels, latestRelease, bestReasoningModel],
  );

  const providerStats = useMemo<HomeProviderStat[]>(
    () =>
      computeProviderStats(artificialData, t("unknown"))
        .filter((p): p is typeof p & { avgSpeed: number } => p.avgSpeed != null)
        .map(({ name, color, count, avgSpeed }) => ({ name, color, avgSpeed, count }))
        .sort((a, b) => b.avgSpeed - a.avgSpeed),
    [artificialData, t],
  );

  return { downloadStats, hallucinationStats, kpiStrip, providerStats, t2iModels };
}
