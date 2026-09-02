import { useTranslation } from "@/client/providers";
import { MODEL_SOURCES } from "@/shared/config";
import { ComparePageLayout } from "./ComparePageLayout";
import { CompareContent } from "./CompareContent";
import { PriceCompareContent } from "./PriceCompareContent";

/** Side-by-side model comparison with a radar chart and per-metric best/worst highlighting. */
export function CompareView() {
  const { t } = useTranslation();
  return (
    <ComparePageLayout backLabelKey="backToModelRankings" backTo={MODEL_SOURCES.aa.backTo} title={t("modelComparison")}>
      {(models) => <CompareContent models={models} />}
    </ComparePageLayout>
  );
}

/** Price-focused comparison: pricing table, per-row bar chart and a monthly cost estimator. */
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
