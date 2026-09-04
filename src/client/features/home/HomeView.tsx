import { lazy, memo, Suspense, useMemo } from "react";
import { Rocket, Image, BarChart3, Lightbulb } from "lucide-react";
import { useTranslation } from "@/client/providers";
import {
  useSuspenseArtificialRankings,
  useSuspenseHomeDashboard,
  useSuspenseHallucinationRankings,
} from "@/client/api/queries";
import { SuspenseQuery } from "@/client/components/shared";
import { SearchInput } from "@/client/search";
import { Card, CardContent, StatCard, CardGrid, Dot } from "@/client/components/ui";
import { PageContainer, PageSection } from "@/client/components/layout";
import { computeProviderStats, formatDollar, formatShortNumber, formatSpeed, shortModelId } from "@/client/utils";
import type {
  ArtificialAnalysisModel,
  HallucinationRankingEntry,
  HomeDashboardData,
  TextToImageModel,
} from "@/shared/types";
import type { TranslationKey } from "@/shared/i18n";
import type { HomeBarStat } from "./stats";

const IndexLineChart = lazy(() => import("./charts").then((m) => ({ default: m.IndexLineChart })));
// DOM-only stats ride a separate chunk so they don't wait for chart.js.
const StatisticsSection = lazy(() => import("./stats").then((m) => ({ default: m.StatisticsSection })));

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

function useHomeStats(
  artificialData: ArtificialAnalysisModel[],
  hallucinationRankings: HallucinationRankingEntry[],
  dashboardData: HomeDashboardData,
  t: (key: TranslationKey, params?: Record<string, string | number>) => string,
) {
  const openSourceRankings = dashboardData.opensource ?? [];
  // Fresh object per query resolution; stabilize identity for memos below.
  const t2iModels = useMemo(() => dashboardData.textToImage?.models ?? [], [dashboardData.textToImage?.models]);
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
    let latestTs = -Infinity;
    let bestReasoning: ArtificialAnalysisModel | null = null;
    for (const m of artificialData) {
      // Compare timestamps, not strings (non-zero-padded dates break lexical order).
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
      computeProviderStats(artificialData, t("unknown"))
        // Drop providers without speed samples (no "0.0 tokens/s" implying zero).
        .filter(({ avgSpeed }) => avgSpeed != null)
        .map(({ name, color, count, avgSpeed }) => ({ name, color, avgSpeed: avgSpeed ?? 0, count }))
        .sort((a, b) => b.avgSpeed - a.avgSpeed),
    [artificialData, t],
  );

  return { downloadStats, hallucinationStats, kpiStrip, providerStats, t2iModels };
}

function formatRatingInterval(entry: TextToImageModel): string {
  if (entry.eloUpper == null || entry.eloLower == null) return "";
  return ` (${entry.eloLower.toFixed(0)}–${entry.eloUpper.toFixed(0)})`;
}

const KpiStrip = memo(function KpiStrip({ kpis }: { kpis: HomeKpi[] }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
      {/* Label keys are stable while positions are not. */}
      {kpis.map((kpi) => (
        <StatCard key={kpi.label} icon={kpi.Icon} label={kpi.label} value={kpi.value} />
      ))}
    </div>
  );
});

const ProviderSpeedCard = memo(function ProviderSpeedCard({ providerStats }: { providerStats: HomeProviderStat[] }) {
  const { t } = useTranslation();
  return (
    <Card className="h-full">
      <CardContent padding="md" className="flex flex-col h-full">
        <p className="ui-caption font-medium mb-3">{t("providerSpeed")}</p>
        <div className="flex flex-col gap-3 flex-1 justify-between">
          {providerStats.slice(0, 6).map((p) => (
            <div key={p.name} className="flex items-center justify-between gap-3 min-w-0">
              <div className="flex items-center gap-2 min-w-0">
                <Dot color={p.color} />
                <span className="text-sm font-medium truncate">{p.name}</span>
              </div>
              <span className="text-sm font-semibold font-mono ml-3 shrink-0">
                {formatSpeed(t, p.avgSpeed)} {t("tokensPerSecond")}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
});

const TextToImageCard = memo(function TextToImageCard({ entry }: { entry: TextToImageModel }) {
  const { t, lang } = useTranslation();
  const locale = lang === "zh" ? "zh-CN" : "en-US";
  return (
    <Card>
      <CardContent padding="md" className="flex flex-col gap-3 w-full">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <span className="ui-card-title truncate">{entry.name}</span>
            {entry.creatorName && (
              <span className="ui-caption truncate shrink-0">({entry.creatorName})</span>
            )}
          </div>
          <span className="font-mono tabular-nums text-xs text-text-tertiary shrink-0">#{entry.rank}</span>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1.5 ui-caption">
          <span>
            {t("elo")}:{" "}
            <strong className="text-text-primary font-semibold">
              {entry.elo != null ? `${entry.elo.toFixed(0)}${formatRatingInterval(entry)}` : t("notAvailable")}
            </strong>
          </span>
          <span>
            {t("votes")}:{" "}
            <strong className="text-text-primary font-semibold">
              {entry.appearances != null ? entry.appearances.toLocaleString(locale) : t("notAvailable")}
            </strong>
          </span>
          {entry.pricePer1kImages != null ? (
            <span>
              {t("price")}:{" "}
              <strong className="text-text-primary font-semibold">
                {formatDollar(entry.pricePer1kImages, t)}
                {t("per1kImages")}
              </strong>
            </span>
          ) : null}
          {entry.winRate != null ? (
            <span>
              {t("winRateShort")}:{" "}
              <strong className="text-text-primary font-semibold">{(entry.winRate * 100).toFixed(1)}%</strong>
            </span>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
});

const TextToImageSection = memo(function TextToImageSection({ models }: { models: TextToImageModel[] }) {
  const { t } = useTranslation();
  if (models.length === 0) return null;
  return (
    <PageSection title={t("textToImage")} description={t("artificialSource")}>
      <CardGrid cols={4} gap={3}>
        {models.slice(0, 8).map((entry) => (
          <TextToImageCard key={entry.id} entry={entry} />
        ))}
      </CardGrid>
    </PageSection>
  );
});

function HomeContent() {
  const { t } = useTranslation();
  const { data: artificialData } = useSuspenseArtificialRankings();
  const hallucinationRankings = useSuspenseHallucinationRankings();
  const { data: dashboardData } = useSuspenseHomeDashboard();
  const { downloadStats, hallucinationStats, kpiStrip, providerStats, t2iModels } = useHomeStats(
    artificialData,
    hallucinationRankings,
    dashboardData,
    t,
  );

  return (
    <PageContainer>
      <div className="flex justify-end mb-4">
        <SearchInput />
      </div>

      <div className="mb-5 sm:mb-6">
        <KpiStrip kpis={kpiStrip} />
      </div>

      <PageSection>
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          <div className="lg:col-span-3">
            <Suspense
              fallback={
                <Card>
                  <CardContent padding="md">
                    <p className="ui-card-title mb-4">{t("intelligenceIndex")}</p>
                    <div className="h-[200px] sm:h-[240px] animate-pulse bg-bg-secondary" />
                  </CardContent>
                </Card>
              }
            >
              <IndexLineChart models={artificialData} />
            </Suspense>
          </div>
          <ProviderSpeedCard providerStats={providerStats} />
        </div>
      </PageSection>

      <Suspense fallback={null}>
        <StatisticsSection downloadStats={downloadStats} hallucinationStats={hallucinationStats} />
      </Suspense>

      <TextToImageSection models={t2iModels} />
    </PageContainer>
  );
}

/** Landing dashboard: KPIs, chart, provider speeds, stats, text-to-image board. */
export function HomeView() {
  return (
    <SuspenseQuery>
      <HomeContent />
    </SuspenseQuery>
  );
}
