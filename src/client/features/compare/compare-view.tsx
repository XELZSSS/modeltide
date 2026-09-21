"use client";
import { useTranslation } from "@/client/providers";
import { MODEL_SOURCES } from "@/client/config/nav-config";
import { ComparePageLayout } from "./compare-layout";
import { CompareContent } from "./compare-radar";

export function CompareView() {
  const { t } = useTranslation();
  return (
    <ComparePageLayout backLabelKey="backToModelRankings" backTo={MODEL_SOURCES.aa.backTo} title={t("modelComparison")}>
      {(models) => <CompareContent models={models} />}
    </ComparePageLayout>
  );
}
