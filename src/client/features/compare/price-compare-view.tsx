import { Suspense, memo, useCallback, useMemo, type ReactNode } from "react";
import { useTranslation } from "@/client/providers";
import type { ArtificialAnalysisModel } from "@/shared/types";
import { formatDollar } from "@/client/utils/format";
import { ChartCard } from "@/client/components/ui/chart-frame";
import { buildPriceRows, type CompareRow, type Winner } from "./compare-logic";
import { CompareTable, WinnerValue } from "@/client/features/compare/compare-table";
import { CostEstimator } from "@/client/features/compare/price-compare/estimator";
import { MODEL_SOURCES } from "@/client/config/nav-config";
import { ComparePageLayout } from "./compare-layout";
import { loadableView } from "@/client/router/lazy-view";

const PriceChart = loadableView(() =>
  import("@/client/features/compare/price-compare/price-chart").then((m) => ({ default: m.PriceChart })),
);

const PriceCompareContent = memo(function PriceCompareContent({ models }: { models: ArtificialAnalysisModel[] }) {
  const { t } = useTranslation();
  const priceRows = useMemo(() => buildPriceRows(t), [t]);
  const renderPrice = useCallback(
    (row: CompareRow<ArtificialAnalysisModel>, model: ArtificialAnalysisModel, winner: Winner | null): ReactNode => {
      const value = row.getNumeric?.(model);
      return typeof value === "number" ? (
        <WinnerValue value={formatDollar(value, t)} winner={winner} />
      ) : (
        <span className="text-text-tertiary">{t("notAvailable")}</span>
      );
    },
    [t],
  );

  return (
    <>
      <div className="flex flex-col gap-3">
        <p className="text-sm font-semibold">{t("priceBreakdown")}</p>
        <CompareTable rows={priceRows} models={models} mobileLayout="model-cards" renderValue={renderPrice} />
      </div>
      <Suspense fallback={<PriceChartFallback />}>
        <PriceChart priceRows={priceRows} models={models} />
      </Suspense>
      <CostEstimator models={models} />
    </>
  );
});

function PriceChartFallback() {
  const { t } = useTranslation();
  return <ChartCard title={t("priceComparison")} loading />;
}

export function PriceCompareView() {
  const { t } = useTranslation();
  return (
    <ComparePageLayout backTo={`${MODEL_SOURCES.aa.backTo}&view=pricing`} title={t("priceComparison")}>
      {(models) => <PriceCompareContent models={models} />}
    </ComparePageLayout>
  );
}
