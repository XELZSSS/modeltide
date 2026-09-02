import { memo, useMemo } from "react";
import { Input } from "@/client/components/ui";
import { useTranslation } from "@/client/providers";
import { formatDollar } from "@/client/utils";
import type { TFunction } from "@/shared/i18n";
import type { CostInputState } from "./useCostEstimator";

interface CostFieldDef {
  id: string;
  value: string;
  onChange: (v: string) => void;
  label: string;
  unit?: string;
}

function getCostFields(state: CostInputState, t: TFunction): CostFieldDef[] {
  // Token volumes are entered in millions ("M") and the hit rate as a percentage.
  return [
    { id: "dailyInput", value: state.dailyInput, onChange: state.setDailyInput, label: t("dailyPromptTokens"), unit: "M" },
    { id: "dailyOutput", value: state.dailyOutput, onChange: state.setDailyOutput, label: t("dailyCompletionTokens"), unit: "M" },
    { id: "dailyReasoning", value: state.dailyReasoning, onChange: state.setDailyReasoning, label: t("dailyReasoningTokens"), unit: "M" },
    { id: "cacheHitRate", value: state.cacheHitRate, onChange: state.setCacheHitRate, label: t("cacheHitRate"), unit: "%" },
    { id: "daysPerMonth", value: state.daysPerMonth, onChange: state.setDaysPerMonth, label: t("daysPerMonth") },
  ];
}

export interface CostEstimatorInputsProps {
  state: CostInputState;
  layout?: "input-label" | "label-input-unit";
  avgCost?: number;
}

/**
 * Numeric inputs driving the cost estimator, rendered in one of two
 * label/input arrangements to fit different screen widths.
 */
export const CostEstimatorInputs = memo(function CostEstimatorInputs({
  state,
  layout = "input-label",
  avgCost,
}: CostEstimatorInputsProps) {
  const { t } = useTranslation();
  const fields = useMemo(() => getCostFields(state, t), [state, t]);

  return (
    <>
      {fields.map((field) =>
        layout === "label-input-unit" ? (
          <div key={field.id} className="flex items-center gap-2">
            <label className="text-xs text-text-secondary whitespace-nowrap">{field.label}</label>
            <Input
              type="number"
              value={field.value}
              onChange={(e) => field.onChange(e.target.value)}
              className="w-20 h-9 text-sm"
            />
            {field.unit ? <span className="text-xs text-text-secondary">{field.unit}</span> : null}
          </div>
        ) : (
          <div key={field.id} className="flex items-center gap-1.5">
            <Input
              type="number"
              value={field.value}
              onChange={(e) => field.onChange(e.target.value)}
              className="w-24 sm:w-28"
              placeholder={field.label}
            />
            <span className="text-xs text-text-secondary whitespace-nowrap">
              {field.unit ? `${field.label} (${field.unit})` : field.label}
            </span>
          </div>
        ),
      )}
      {layout === "input-label" && typeof avgCost === "number" && (
        <div className="flex items-center gap-1">
          <span className="text-sm text-text-secondary">{t("estimatedMonthlyCost")}:</span>
          <span className="text-base font-semibold font-mono">{formatDollar(avgCost, t)}</span>
          <span className="text-xs text-text-secondary">{t("perModelAvg")}</span>
        </div>
      )}
    </>
  );
});
