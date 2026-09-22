import { Suspense, lazy, useMemo } from "react";
import { useTranslation } from "@/client/providers";
import { ChartCard } from "@/client/components/ui/chart-frame";
import type { ArtificialAnalysisModel } from "@/shared/types";
import { buildCompareRows, type CompareRow } from "./compare-logic";
import { CompareTable, WinnerValue } from "./compare-table";

const CompareRadarChart = lazy(() => import("./compare-radar-chart").then((m) => ({ default: m.CompareRadarChart })));

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

function renderMetricValue(
  row: CompareRow<ArtificialAnalysisModel>,
  model: ArtificialAnalysisModel,
  winner: "win" | "loss" | null,
) {
  return <WinnerValue value={row.getValue?.(model) ?? ""} winner={winner} />;
}

export function CompareContent({ models }: { models: ArtificialAnalysisModel[] }) {
  const { t } = useTranslation();
  const rows = useMemo(() => buildCompareRows(t), [t]);

  return (
    <div className="flex flex-col md:flex-row gap-4 sm:gap-6 md:items-stretch">
      <Suspense fallback={<RadarSkeleton />}>
        <CompareRadarChart models={models} />
      </Suspense>
      <div className="min-w-0 w-full md:w-1/2 flex flex-col">
        <CompareTable rows={rows} models={models} renderValue={renderMetricValue} />
      </div>
    </div>
  );
}
