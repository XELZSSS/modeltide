"use client";
import { memo, useCallback, useMemo, type ReactNode } from "react";
import { useTranslation } from "@/client/providers";
import type { ArtificialAnalysisModel } from "@/shared/types";
import { formatDollar } from "@/client/utils/format";
import { buildPriceRows, type CompareRow, type Winner } from "./compare-logic";
import { CompareTable, WinnerValue } from "@/client/features/compare/compare-table";
import { PriceChart } from "@/client/features/compare/price-compare/price-chart";
import { CostEstimator } from "@/client/features/compare/price-compare/estimator";
import { LiteLLMVsRouterTable } from "@/client/features/compare/price-compare/price-compare-table";
import { useOfficialPricing } from "@/client/pricing/official-pricing-hook";
import { MODEL_SOURCES } from "@/client/config/nav-config";
import { ComparePageLayout } from "./compare-layout";

const PriceCompareContent = memo(function PriceCompareContent({ models }: { models: ArtificialAnalysisModel[] }) {
  const { t } = useTranslation();
  const { getOfficial } = useOfficialPricing();
  const priceRows = useMemo(() => buildPriceRows(t, getOfficial), [t, getOfficial]);
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
      <PriceChart priceRows={priceRows} models={models} />
      <CostEstimator models={models} />
      <LiteLLMVsRouterTable models={models} />
    </>
  );
});

export function PriceCompareView() {
  const { t } = useTranslation();
  return (
    <ComparePageLayout
      backLabelKey="backToPricing"
      backTo={`${MODEL_SOURCES.aa.backTo}&view=pricing`}
      title={t("priceComparison")}
    >
      {(models) => <PriceCompareContent models={models} />}
    </ComparePageLayout>
  );
}
