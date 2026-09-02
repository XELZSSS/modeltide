import { memo, useMemo } from "react";
import { Card, CardContent } from "@/client/components/ui";
import { CostEstimatorInputs } from "@/client/components/compare/CostEstimatorInputs";
import { formatDollar, cn, approxEq } from "@/client/utils";
import { getModelColor } from "@/client/utils/charts";
import { useTranslation } from "@/client/providers";
import { useMonthlyCosts } from "@/client/components/compare/useCostEstimator";
import { WinnerMark } from "./PriceTable";
import type { ArtificialAnalysisModel } from "@/shared/types";

/** Interactive monthly-cost estimator that highlights the cheapest model. */
export const CostEstimator = memo(function CostEstimator({ models }: { models: ArtificialAnalysisModel[] }) {
  const { t } = useTranslation();

  const { monthlyCosts, ...inputs } = useMonthlyCosts(models);

  // Cheapest model among valid monthly estimates; compared with approxEq below
  // because costs are derived floats and may not be bit-identical.
  const bestMonthlyCost = useMemo(() => {
    const valid = monthlyCosts.filter((v): v is number => v !== null);
    return valid.length > 0 ? Math.min(...valid) : null;
  }, [monthlyCosts]);

  return (
    <Card>
      <CardContent padding="md">
        <p className="text-sm font-semibold mb-3">{t("estimatedMonthlyCost")}</p>
        <div className="flex flex-col sm:flex-row flex-wrap gap-3 sm:gap-4 mb-4">
          <CostEstimatorInputs state={inputs} layout="label-input-unit" />
        </div>
        <div className="flex flex-col gap-2.5">
          {models.map((model, index) => {
            const cost = monthlyCosts[index];
            const isBest = cost != null && bestMonthlyCost != null && approxEq(cost, bestMonthlyCost);
            return (
              <div key={model.id ?? index} className="flex items-center justify-between gap-2">
                <span className="text-sm truncate" style={{ color: getModelColor(index) }}>
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
