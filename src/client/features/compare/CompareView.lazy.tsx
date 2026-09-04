import { useTranslation } from "@/client/providers";
import { MODEL_SOURCES } from "@/shared/config";
import { ComparePageLayout } from "./ComparePageLayout";
import { CompareContent } from "./CompareTable";

/** Route entry for /compare (own lazy chunk, separate from PriceCompareView). */
export function CompareView() {
  const { t } = useTranslation();
  return (
    <ComparePageLayout backLabelKey="backToModelRankings" backTo={MODEL_SOURCES.aa.backTo} title={t("modelComparison")}>
      {(models) => <CompareContent models={models} />}
    </ComparePageLayout>
  );
}
