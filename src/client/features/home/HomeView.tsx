import { lazy, Suspense } from "react";
import { useTranslation } from "@/client/providers";
import {
  useSuspenseArtificialRankings,
  useSuspenseHomeDashboard,
  useSuspenseHallucinationRankings,
} from "@/client/api/queries";
import { SuspenseQuery } from "@/client/components/shared";
import { SearchInput } from "@/client/search";
import { Card, CardContent } from "@/client/components/ui";
import { PageContainer, PageSection } from "@/client/components/layout";
import { useHomeStats } from "./useHomeStats";
import { KpiStrip, ProviderSpeedCard, TextToImageSection } from "./HomeSections";
import { intelligenceChartTitle } from "./chartTitle";

const chartsImport = () => import("./charts");
const IndexLineChart = lazy(() => chartsImport().then((m) => ({ default: m.IndexLineChart })));
const StatisticsSection = lazy(() => chartsImport().then((m) => ({ default: m.StatisticsSection })));

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

      <div className="mb-6">
        <KpiStrip kpis={kpiStrip} />
      </div>

      <PageSection>
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          <div className="lg:col-span-3">
            <Suspense
              fallback={
                <Card>
                  <CardContent padding="md">
                    <p className="text-sm font-semibold mb-3">{intelligenceChartTitle(t)}</p>
                    <div className="h-[210px] sm:h-[260px] animate-pulse bg-bg-secondary" />
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

/** Landing page dashboard: KPI strip, chart, provider speeds, stats and text-to-image leaderboard. */
export function HomeView() {
  return (
    <SuspenseQuery>
      <HomeContent />
    </SuspenseQuery>
  );
}
