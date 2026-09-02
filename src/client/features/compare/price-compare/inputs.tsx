import { memo, useMemo } from "react";
import { formatDollar } from "@/client/utils/format";
import type { TFunction } from "@/shared/i18n";
import { makeOfficialGetter, type OfficialGetter } from "@/client/utils/pricing-merge";
import { Input } from "@/client/components/ui/input";
import { useTranslation } from "@/client/providers";
import { qOfficialPricing } from "@/client/api/queries";
import {
  COST_FIELDS,
  type CostFieldId,
  type CostInputState,
} from "@/client/features/compare/price-compare/cost-inputs";

interface CostFieldDef {
  id: CostFieldId;
  value: string;
  onChange: (v: string) => void;
  label: string;
  unit?: string;
}

function getCostFields(state: CostInputState, t: TFunction): CostFieldDef[] {
  return COST_FIELDS.map((def) => ({
    id: def.id,
    value: state.values[def.id],
    onChange: (v: string) => state.setField(def.id, v),
    label: t(def.labelKey),
    unit: def.unit,
  }));
}

export function useOfficialGetter(enabled = true): OfficialGetter | undefined {
  const officialQ = qOfficialPricing.use(enabled);
  return useMemo(() => (officialQ.data ? makeOfficialGetter(officialQ.data.models) : undefined), [officialQ.data]);
}

interface CostEstimatorInputsProps {
  state: CostInputState;
  layout?: "input-label" | "label-input-unit";
  avgCost?: number;
}

function CostFieldInput({
  field,
  className,
  placeholder,
  "aria-label": ariaLabel,
}: {
  field: CostFieldDef;
  className?: string;
  placeholder?: string;
  "aria-label"?: string;
}) {
  const invalid = field.value.trim() !== "" && !/^\d*(\.\d*)?$/.test(field.value.trim());
  return (
    <Input
      id={`cost-${field.id}`}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      value={field.value}
      onChange={(e) => field.onChange(e.target.value)}
      aria-invalid={invalid || undefined}
      aria-label={ariaLabel}
      placeholder={placeholder}
      className={className}
    />
  );
}

export const CostEstimatorInputs = memo(function CostEstimatorInputs({
  state,
  layout = "input-label",
  avgCost,
}: CostEstimatorInputsProps) {
  const { t } = useTranslation();
  const { values } = state;
  const fields = useMemo(() => getCostFields(state, t), [values, t]);

  return (
    <>
      {fields.map((field) =>
        layout === "label-input-unit" ? (
          <div key={field.id} className="flex flex-wrap items-center gap-2 min-w-0 max-w-full">
            <label htmlFor={`cost-${field.id}`} className="text-xs text-text-secondary min-w-0">
              {field.label}
            </label>
            <CostFieldInput field={field} className="w-20 h-9 shrink-0" />
            {field.unit ? <span className="text-xs text-text-secondary shrink-0">{field.unit}</span> : null}
          </div>
        ) : (
          <div key={field.id} className="flex flex-wrap items-center gap-2 min-w-0 max-w-full">
            <CostFieldInput
              field={field}
              className="w-24 sm:w-28 shrink-0"
              placeholder={field.label}
              aria-label={field.unit ? `${field.label} (${field.unit})` : field.label}
            />
            {}
            <label htmlFor={`cost-${field.id}`} className="ui-caption min-w-0 cursor-text">
              {field.unit ? `${field.label} (${field.unit})` : field.label}
            </label>
          </div>
        ),
      )}
      {layout === "input-label" && typeof avgCost === "number" && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-text-secondary">{t("estimatedMonthlyCost")}:</span>
          <span className="text-lg font-semibold font-mono tabular-nums">{formatDollar(avgCost, t)}</span>
          <span className="ui-caption">{t("perModelAvg")}</span>
        </div>
      )}
    </>
  );
});
