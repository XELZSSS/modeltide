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
    {
      id: "dailyInput",
      value: state.dailyInput,
      onChange: state.setDailyInput,
      label: t("dailyPromptTokens"),
      unit: "M",
    },
    {
      id: "dailyOutput",
      value: state.dailyOutput,
      onChange: state.setDailyOutput,
      label: t("dailyCompletionTokens"),
      unit: "M",
    },
    {
      id: "dailyReasoning",
      value: state.dailyReasoning,
      onChange: state.setDailyReasoning,
      label: t("dailyReasoningTokens"),
      unit: "M",
    },
    {
      id: "cacheHitRate",
      value: state.cacheHitRate,
      onChange: state.setCacheHitRate,
      label: t("cacheHitRate"),
      unit: "%",
    },
    { id: "daysPerMonth", value: state.daysPerMonth, onChange: state.setDaysPerMonth, label: t("daysPerMonth") },
  ];
}

interface CostEstimatorInputsProps {
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
  // Depend on the individual string values, not the `state` object identity:
  // callers spread estimator state (`{...estimator}`), so the object is new every
  // render and a [state] dep would rebuild fields (and re-render inputs) each time.
  const { dailyInput, dailyOutput, dailyReasoning, cacheHitRate, daysPerMonth } = state;
  const fields = useMemo(
    () => getCostFields(state, t),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dailyInput, dailyOutput, dailyReasoning, cacheHitRate, daysPerMonth, t],
  );

  return (
    <>
      {fields.map((field) =>
        layout === "label-input-unit" ? (
          <div key={field.id} className="flex items-center gap-2">
            <label htmlFor={`cost-${field.id}`} className="text-xs text-text-secondary whitespace-nowrap">
              {field.label}
            </label>
            <Input
              id={`cost-${field.id}`}
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
              id={`cost-${field.id}`}
              type="number"
              value={field.value}
              onChange={(e) => field.onChange(e.target.value)}
              className="w-24 sm:w-28"
              placeholder={field.label}
              aria-label={field.unit ? `${field.label} (${field.unit})` : field.label}
            />
            {/* Visible unit hint: a real <label> so AT associates it with the input. */}
            <label htmlFor={`cost-${field.id}`} className="text-xs text-text-secondary whitespace-nowrap cursor-text">
              {field.unit ? `${field.label} (${field.unit})` : field.label}
            </label>
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
