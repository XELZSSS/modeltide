import { memo, useMemo } from "react";
import { useTranslation } from "@/client/providers";
import type { ArtificialAnalysisModel } from "@/shared/types";
import { buildPriceRows } from "./pricing/pricingRows";
import { PriceTable } from "./pricing/PriceTable";
import { PriceChart } from "./pricing/PriceChart";
import { CostEstimator } from "./pricing/CostEstimator";

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
    </>
  );
});
