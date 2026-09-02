import { useMemo } from "react";
import { Rocket, Image, BarChart3, Lightbulb } from "lucide-react";
import { computeProviderStats, formatShortNumber, shortModelId } from "@/client/utils";
import type { ArtificialAnalysisModel, HallucinationRankingEntry, HomeDashboardData } from "@/shared/types";
import type { TranslationKey } from "@/shared/i18n";
import type { HomeBarStat } from "./charts";

interface HomeKpi {
  label: string;
  value: string;
  Icon: typeof Rocket;
}

interface HomeProviderStat {
  name: string;
  color: string;
  avgSpeed: number;
  count: number;
}

export type { HomeKpi, HomeProviderStat };

export function useHomeStats(
  artificialData: ArtificialAnalysisModel[],
  hallucinationRankings: HallucinationRankingEntry[],
  dashboardData: HomeDashboardData,
  t: (key: TranslationKey, params?: Record<string, string | number>) => string,
) {
  const openSourceRankings = dashboardData.opensource ?? [];
  const t2iModels = dashboardData.textToImage?.models ?? [];
  const latestOpenRouterModel = dashboardData.orRankings?.tokenUsageRankings?.[0] ?? null;

  const downloadStats = useMemo<HomeBarStat[]>(
    () =>
      openSourceRankings.slice(0, 7).map((model) => ({
        label: shortModelId(model.id),
        value: model.downloads,
        valueLabel: formatShortNumber(model.downloads),
      })),
    [openSourceRankings],
  );

  const hallucinationStats = useMemo<HomeBarStat[]>(
    () =>
      hallucinationRankings
        .filter((entry) => entry.accuracy != null)
        .slice(0, 7)
        .map((entry) => ({
          label: entry.model,
          value: entry.accuracy ?? 0,
          valueLabel: `${entry.accuracy?.toFixed(1)}%`,
        })),
    [hallucinationRankings],
  );

  const { latestRelease, bestReasoningModel } = useMemo(() => {
    let latest: ArtificialAnalysisModel | null = null;
    let bestReasoning: ArtificialAnalysisModel | null = null;
    for (const m of artificialData) {
      if (m.release_date && (!latest?.release_date || m.release_date > latest.release_date)) latest = m;
      if (m.is_reasoning === true && (!bestReasoning || (m.intelligence_index ?? -Infinity) > (bestReasoning.intelligence_index ?? -Infinity))) bestReasoning = m;
    }
    return { latestRelease: latest, bestReasoningModel: bestReasoning };
  }, [artificialData]);

  const kpiStrip = useMemo<HomeKpi[]>(
    () => [
      { label: t("openRouterRankings"), value: latestOpenRouterModel?.name || t("notAvailable"), Icon: BarChart3 },
      { label: t("bestT2IModel"), value: t2iModels[0]?.name || t("notAvailable"), Icon: Image },
      {
        label: t("latestRelease"),
        value: latestRelease?.short_name || latestRelease?.name || t("notAvailable"),
        Icon: Rocket,
      },
      {
        label: t("bestReasoningModel"),
        value: bestReasoningModel?.short_name || bestReasoningModel?.name || t("notAvailable"),
        Icon: Lightbulb,
      },
    ],
    [t, latestOpenRouterModel?.name, t2iModels, latestRelease, bestReasoningModel],
  );

  const providerStats = useMemo<HomeProviderStat[]>(
    () =>
      computeProviderStats(artificialData)
        // Providers without speed samples would render as "0.0 tokens/s"; drop them
        // instead of implying a measured speed of zero.
        .filter(({ avgSpeed }) => avgSpeed != null)
        .map(({ name, color, count, avgSpeed }) => ({ name, color, avgSpeed: avgSpeed ?? 0, count }))
        .sort((a, b) => b.avgSpeed - a.avgSpeed),
    [artificialData],
  );

  return { downloadStats, hallucinationStats, kpiStrip, providerStats, t2iModels };
}
