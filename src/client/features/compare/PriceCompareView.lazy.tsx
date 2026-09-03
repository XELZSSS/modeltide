import { memo, useMemo } from "react";
import { useTranslation } from "@/client/providers";
import type { ArtificialAnalysisModel } from "@/shared/types";
import { buildPriceRows } from "./logic";
import { PriceTable, PriceChart, CostEstimator, OfficialVsRouterTable } from "./pricing";
import { MODEL_SOURCES } from "@/shared/config";
import { ComparePageLayout } from "./ComparePageLayout";

// ---- client/features/compare/PriceCompareContent.tsx ----
export const PriceCompareContent = memo(function PriceCompareContent({
  models,
}: {
  models: ArtificialAnalysisModel[];
}) {
  const { t } = useTranslation();
  const priceRows = useMemo(() => buildPriceRows(t), [t]);

  return (
    <>
      {/* Plain heading; PriceTable frames the table itself so there's no card-in-card. */}
      <div className="flex flex-col gap-3">
        <p className="text-sm font-semibold">{t("priceBreakdown")}</p>
        <PriceTable priceRows={priceRows} models={models} />
      </div>
      <PriceChart priceRows={priceRows} models={models} />
      <CostEstimator models={models} />
      <OfficialVsRouterTable models={models} />
    </>
  );
});

// ---- client/features/compare/PriceCompareView.lazy.tsx ----
/** Route entry for /price-compare (separate lazy chunk from CompareView). */
export function PriceCompareView() {
  const { t } = useTranslation();
  return (
    <ComparePageLayout
      backLabelKey="backToPricing"
      backTo={MODEL_SOURCES.aa.backTo}
      backState={{ viewMode: "pricing" }}
      title={t("priceComparison")}
    >
      {(models) => <PriceCompareContent models={models} />}
    </ComparePageLayout>
  );
}
