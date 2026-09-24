import { memo, useMemo } from "react";
import { approxEq } from "@/shared/utils";
import { modelDisplayName, modelId } from "@/client/utils/model-utils";
import { formatDollar } from "@/client/utils/format";
import { cn } from "@/client/utils/cn";
import type { ArtificialAnalysisModel } from "@/shared/types";
import { Card, CardContent, CardHeader } from "@/client/components/ui/card";
import { useTranslation } from "@/client/providers";
import { useChartTheme, seriesColor } from "@/client/theme/chart-theme";
import { useMonthlyCosts } from "@/client/pricing/cost-inputs";
import { CostEstimatorInputs } from "@/client/pricing/cost-form";
import { WinnerMark } from "@/client/features/compare/compare-table";

export const CostEstimator = memo(function CostEstimator({ models }: { models: ArtificialAnalysisModel[] }) {
  const { t } = useTranslation();
  const theme = useChartTheme();

  const costState = useMonthlyCosts(models);
  const { monthlyCosts } = costState;
  const bestMonthlyCost = useMemo(() => {
    const valid = [...monthlyCosts.values()].filter((v): v is number => v !== null);
    return valid.length > 0 ? Math.min(...valid) : null;
  }, [monthlyCosts]);

  return (
    <Card>
      <CardContent>
        <CardHeader title={t("estimatedMonthlyCost")} />
        <div className="flex flex-col sm:flex-row flex-wrap gap-3 sm:gap-4 mb-5">
          <CostEstimatorInputs state={costState} layout="label-input-unit" />
        </div>
        <div className="flex flex-col gap-3">
          {models.map((model, index) => {
            const cost = monthlyCosts.get(modelId(model)) ?? null;
            const isBest = cost != null && bestMonthlyCost != null && approxEq(cost, bestMonthlyCost);
            return (
              <div key={modelId(model) || `idx-${index}`} className="flex items-center justify-between gap-2">
                <span className="text-sm truncate" style={{ color: seriesColor(theme, index) }}>
                  {modelDisplayName(model)}
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
