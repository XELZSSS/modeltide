import { Suspense, lazy } from "react";
import { useTranslation } from "@/client/providers";
import { ChartCard } from "@/client/components/ui/chart-frame";
import type { ArtificialAnalysisModel } from "@/shared/types";

const CompareRadarChart = lazy(() => import("./compare-radar-chart").then((m) => ({ default: m.CompareRadarChart })));
const CompareButterflyChart = lazy(() =>
  import("./compare-butterfly-chart").then((m) => ({ default: m.CompareButterflyChart })),
);

function RadarSkeleton() {
  return (
    <ChartCard
      loading
      className="w-full md:w-1/2"
      contentClassName="h-full flex items-center justify-center"
      skeletonHeight="h-[240px] sm:h-[320px]"
    />
  );
}

function ButterflySkeleton() {
  const { t } = useTranslation();
  return (
    <ChartCard
      loading
      title={t("compareValues")}
      className="w-full md:w-1/2"
      contentClassName="h-full"
      skeletonHeight="h-[240px] sm:h-[300px]"
    />
  );
}

export function CompareContent({ models }: { models: ArtificialAnalysisModel[] }) {
  return (
    <div className="flex flex-col md:flex-row gap-4 sm:gap-6 md:items-stretch">
      <Suspense fallback={<RadarSkeleton />}>
        <CompareRadarChart models={models} />
      </Suspense>
      <Suspense fallback={<ButterflySkeleton />}>
        <CompareButterflyChart models={models} />
      </Suspense>
    </div>
  );
}
