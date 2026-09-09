"use client";
import { useMemo } from "react";
import type { TranslationKey } from "@/shared/i18n";
import { BarChart3, Brain, Image, Rocket, type LucideIcon } from "lucide-react";
import type { ArtificialAnalysisModel, ClosedReleaseEntry, HallucinationRankingEntry } from "@/shared/types";
import type { NormalizedHomeDashboard } from "@/client/api/normalize";
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

const top7 = <T>(items: T[], map: (item: T) => HomeBarStat): HomeBarStat[] => items.slice(0, 7).map(map);

function finiteTs(value: string | null | undefined): number | null {
  if (!value) return null;
  const ts = Date.parse(value);
  return Number.isFinite(ts) ? ts : null;
}

/**
 * Newest release name from the same feed as the releases page 模型发布 tab,
 * so the home KPI always matches its head. (The intelligence index carries
 * its own release_date per model, which lags the changelog and must not be
 * used here.)
 */
export function pickLatestReleaseName(closedReleases: ClosedReleaseEntry[]): string | null {
  for (const entry of closedReleases) {
    if (entry && finiteTs(entry.releaseDate) != null) return entry.model;
  }
  return null;
}

export function useHomeStats(
  artificialData: ArtificialAnalysisModel[],
  hallucinationRankings: HallucinationRankingEntry[],
  dashboardData: NormalizedHomeDashboard,
  t: (key: TranslationKey, params?: Record<string, string | number>) => string,
  closedReleases?: ClosedReleaseEntry[],
) {
  const openSourceRankings = dashboardData.opensource;
  // Trending order inherited from the upstream pool, mirroring the official
  // models page (Sort: Trending). Download counts are shown as reference.
  const trendingPool = openSourceRankings;
  const t2iModels = useMemo(() => dashboardData.textToImage?.models ?? [], [dashboardData.textToImage?.models]);
  const latestOpenRouterModel = dashboardData.orRankings?.tokenUsageRankings?.[0] ?? null;

  const trendingStats = useMemo<HomeBarStat[]>(
    () =>
      top7(trendingPool, (model) => ({
        label: shortModelId(model.id),
        value: model.downloads,
        valueLabel: formatShortNumber(model.downloads),
      })),
    [trendingPool],
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

  const { latestReleaseName, bestReasoningModel } = useMemo(() => {
    const latestName = closedReleases ? pickLatestReleaseName(closedReleases) : null;
    let bestReasoning: ArtificialAnalysisModel | null = null;
    for (const m of artificialData) {
      if (
        m.is_reasoning === true &&
        (!bestReasoning || (m.intelligence_index ?? -Infinity) > (bestReasoning.intelligence_index ?? -Infinity))
      )
        bestReasoning = m;
    }
    return { latestReleaseName: latestName, bestReasoningModel: bestReasoning };
  }, [artificialData, closedReleases]);

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
        value: latestReleaseName || t("notAvailable"),
        Icon: Rocket,
      },
      {
        id: "reasoning",
        label: t("bestReasoningModel"),
        value: bestReasoningModel?.short_name || bestReasoningModel?.name || t("notAvailable"),
        Icon: Brain,
      },
    ],
    [t, latestOpenRouterModel?.name, t2iModels, latestReleaseName, bestReasoningModel],
  );

  const providerStats = useMemo<HomeProviderStat[]>(
    () =>
      computeProviderStats(artificialData, t("unknown"))
        .filter((p): p is typeof p & { avgSpeed: number } => p.avgSpeed != null)
        .map(({ name, color, count, avgSpeed }) => ({ name, color, avgSpeed, count }))
        .sort((a, b) => b.avgSpeed - a.avgSpeed),
    [artificialData, t],
  );

  return { trendingStats, hallucinationStats, kpiStrip, providerStats, t2iModels };
}
