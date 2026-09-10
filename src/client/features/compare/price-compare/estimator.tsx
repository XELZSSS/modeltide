"use client";
import { memo, useMemo } from "react";
import { approxEq } from "@/shared/utils";
import { modelId } from "@/client/utils/model";
import { formatDollar } from "@/client/utils/format";
import { cn } from "@/client/utils/cn";
import type { ArtificialAnalysisModel } from "@/shared/types";
import { Card, CardContent } from "@/client/components/ui/card";
import { useTranslation } from "@/client/providers";
import { useChartTheme, seriesColor } from "@/client/theme/chart-theme";
import { useMonthlyCosts } from "@/client/features/pricing/cost-inputs";
import { CostEstimatorInputs } from "@/client/features/pricing/inputs";
import { useOfficialPricing } from "@/client/features/pricing/official";
import { WinnerMark } from "@/client/features/compare/CompareTable";

export const CostEstimator = memo(function CostEstimator({ models }: { models: ArtificialAnalysisModel[] }) {
  const { t } = useTranslation();
  const theme = useChartTheme();

  const { getOfficial } = useOfficialPricing();
  const { monthlyCosts, ...inputs } = useMonthlyCosts(models, getOfficial);
  const bestMonthlyCost = useMemo(() => {
    const valid = monthlyCosts.filter((v): v is number => v !== null);
    return valid.length > 0 ? Math.min(...valid) : null;
  }, [monthlyCosts]);

  return (
    <Card>
      <CardContent>
        <p className="ui-card-title mb-4">{t("estimatedMonthlyCost")}</p>
        <div className="flex flex-col sm:flex-row flex-wrap gap-3 sm:gap-4 mb-5">
          <CostEstimatorInputs state={inputs} layout="label-input-unit" />
        </div>
        <div className="flex flex-col gap-3">
          {models.map((model, index) => {
            const cost = monthlyCosts[index];
            const isBest = cost != null && bestMonthlyCost != null && approxEq(cost, bestMonthlyCost);
            return (
              <div key={modelId(model) || `idx-${index}`} className="flex items-center justify-between gap-2">
                <span className="text-sm truncate" style={{ color: seriesColor(theme, index) }}>
                  {model.short_name || model.name}
                </span>
                {cost != null ? (
                  <span className={cn("font-mono text-sm", isBest && "font-semibold text-success")}>
                    {formatDollar(cost, t)}
                    {isBest && <WinnerMark />}
                  </span>
                ) : (
                  <span className="text-sm text-text-tertiary">{t("notAvailable")}</span>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
});
