import { Suspense, lazy } from "react";
import { useMemo } from "react";
import { useTranslation } from "@/client/providers";
import {
  useSuspenseArtificialRankings,
  useSuspenseHomeDashboard,
  useSuspenseHallucinationRankings,
} from "@/client/api/queries";
import { SuspenseQuery } from "@/client/components/feedback";
import { SearchInput } from "@/client/search/SearchInput";
import { Card, CardContent } from "@/client/components/ui/card";
import { PageContainer, PageSection } from "@/client/components/layout";
import { useHomeStats } from "./use-home-stats";
import { KpiStrip, ProviderSpeedCard, TextToImageSection } from "./cards";

const IndexLineChart = lazy(() => import("./charts").then((m) => ({ default: m.IndexLineChart })));
const UsageDonut = lazy(() => import("./UsageDonut").then((m) => ({ default: m.UsageDonut })));
const StatisticsSection = lazy(() => import("./statistics-section").then((m) => ({ default: m.StatisticsSection })));

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
  const usageEntries = useMemo(() => dashboardData.orRankings?.tokenUsageRankings ?? [], [dashboardData.orRankings]);

  return (
    <PageContainer>
      <div className="flex justify-end min-w-0 mb-4">
        <SearchInput />
      </div>

      <div className="mb-5 sm:mb-6">
        <KpiStrip kpis={kpiStrip} />
      </div>

      <PageSection>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
          <div className="lg:col-span-6">
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
          <div className="lg:col-span-3">
            <Suspense
              fallback={
                <Card>
                  <CardContent padding="md">
                    <div className="h-[200px] sm:h-[240px] animate-pulse bg-bg-secondary" />
                  </CardContent>
                </Card>
              }
            >
              <UsageDonut entries={usageEntries} />
            </Suspense>
          </div>
          <div className="lg:col-span-3">
            <ProviderSpeedCard providerStats={providerStats} />
          </div>
        </div>
      </PageSection>

      <Suspense fallback={null}>
        <StatisticsSection downloadStats={downloadStats} hallucinationStats={hallucinationStats} />
      </Suspense>

      <TextToImageSection models={t2iModels} />
    </PageContainer>
  );
}

export function HomeView() {
  return (
    <SuspenseQuery>
      <HomeContent />
    </SuspenseQuery>
  );
}
