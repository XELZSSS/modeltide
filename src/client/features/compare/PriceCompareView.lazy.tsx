import { useTranslation } from "@/client/providers";
import { MODEL_SOURCES } from "@/shared/config";
import { ComparePageLayout } from "./ComparePageLayout";
import { PriceCompareContent } from "./PriceCompareContent";

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
