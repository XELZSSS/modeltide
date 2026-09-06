import { memo, useMemo } from "react";
import { useTranslation } from "@/client/providers";
import type { ArtificialAnalysisModel } from "@/shared/types";
import { buildPriceRows } from "./logic";
import { PriceTable } from "@/client/features/compare/price-compare/price-table";
import { PriceChart } from "@/client/features/compare/price-compare/price-chart";
import { CostEstimator } from "@/client/features/compare/price-compare/estimator";
import { LiteLLMVsRouterTable } from "@/client/features/compare/price-compare/litellm-vs-router-table";
import { MODEL_SOURCES } from "@/shared/config";
import { ComparePageLayout } from "./ComparePageLayout";

export const PriceCompareContent = memo(function PriceCompareContent({
  models,
}: {
  models: ArtificialAnalysisModel[];
}) {
  const { t } = useTranslation();
  const priceRows = useMemo(() => buildPriceRows(t), [t]);

  return (
    <>
      <div className="flex flex-col gap-3">
        <p className="text-sm font-semibold">{t("priceBreakdown")}</p>
        <PriceTable priceRows={priceRows} models={models} />
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
