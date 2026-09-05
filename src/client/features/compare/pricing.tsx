import { useDeferredValue, useMemo, useState, memo } from "react";
import {
  calcMonthlyCost,
  formatDollar,
  cn,
  approxEq,
  modelId,
  indexOfficialPricing,
  matchOfficialPricing,
  type OfficialGetter,
} from "@/client/utils";
import type { ArtificialAnalysisModel, OfficialPriceModel } from "@/shared/types";
import { Input, Card, CardContent } from "@/client/components/ui";
import { useTranslation } from "@/client/providers";
import type { TFunction } from "@/shared/i18n";
import {
  seriesColor,
  hexToRgba,
  chartBase,
  axisTickStyle,
  axisGridStyle,
  axisDashedBorderStyle,
  legendStyle,
  defaultTooltipOptions,
} from "@/client/utils/charts";
import { useChartTheme } from "@/client/hooks";
import type { ChartOptions } from "chart.js";
import { Bar } from "react-chartjs-2";
import type { CompareRow } from "./logic";
import { TrendingUp } from "lucide-react";
import { CompareTable, modelKeyOf, modelNameOf, useModelColorOf } from "@/client/features/compare/CompareTable";
import { DataTable, type DataTableColumn } from "@/client/components/data";
import { qOfficialPricing } from "@/client/api/queries";

// ---- useCostEstimator ----
export interface CostInputState {
  dailyInput: string;
  setDailyInput: (v: string) => void;
  dailyOutput: string;
  setDailyOutput: (v: string) => void;
  dailyReasoning: string;
  setDailyReasoning: (v: string) => void;
  cacheHitRate: string;
  setCacheHitRate: (v: string) => void;
  daysPerMonth: string;
  setDaysPerMonth: (v: string) => void;
}

interface CostEstimatorState extends CostInputState {
  calcInput: number;
  calcOutput: number;
  calcReasoning: number;
  calcCache: number;
  calcDays: number;
}

/** Default estimator inputs (tokens/day in M, 50% cache hits, 22 workdays). */
export const DEFAULT_COST_INPUTS = {
  dailyInput: "2",
  dailyOutput: "1",
  dailyReasoning: "2",
  cacheHitRate: "50",
  daysPerMonth: "22",
} as const;

/** Text field with a deferred value so parsing never blocks typing. */
function useTextField(initial: string) {
  const [value, setValue] = useState<string>(initial);
  const deferred = useDeferredValue(value);
  return { value, setValue, deferred };
}

function useCostEstimator(): CostEstimatorState {
  const {
    value: dailyInput,
    setValue: setDailyInput,
    deferred: deferredInput,
  } = useTextField(DEFAULT_COST_INPUTS.dailyInput);
  const {
    value: dailyOutput,
    setValue: setDailyOutput,
    deferred: deferredOutput,
  } = useTextField(DEFAULT_COST_INPUTS.dailyOutput);
  const {
    value: dailyReasoning,
    setValue: setDailyReasoning,
    deferred: deferredReasoning,
  } = useTextField(DEFAULT_COST_INPUTS.dailyReasoning);
  const {
    value: cacheHitRate,
    setValue: setCacheHitRate,
    deferred: deferredCache,
  } = useTextField(DEFAULT_COST_INPUTS.cacheHitRate);
  const {
    value: daysPerMonth,
    setValue: setDaysPerMonth,
    deferred: deferredDays,
  } = useTextField(DEFAULT_COST_INPUTS.daysPerMonth);

  // Bad input counts as 0; hit rate clamped to 0-100% and normalized to 0..1.
  const calcInput = Math.max(0, Number(deferredInput) || 0);
  const calcOutput = Math.max(0, Number(deferredOutput) || 0);
  const calcReasoning = Math.max(0, Number(deferredReasoning) || 0);
  const calcCache = Math.max(0, Math.min(100, Number(deferredCache) || 0)) / 100;
  const calcDays = Math.max(1, Number(deferredDays) || 0);

  // useState setters are stable and exempt from deps.
  return useMemo(
    () => ({
      dailyInput,
      setDailyInput,
      dailyOutput,
      setDailyOutput,
      dailyReasoning,
      setDailyReasoning,
      cacheHitRate,
      setCacheHitRate,
      daysPerMonth,
      setDaysPerMonth,
      calcInput,
      calcOutput,
      calcReasoning,
      calcCache,
      calcDays,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      dailyInput,
      dailyOutput,
      dailyReasoning,
      cacheHitRate,
      daysPerMonth,
      calcInput,
      calcOutput,
      calcReasoning,
      calcCache,
      calcDays,
    ],
  );
}

export function useMonthlyCosts(models: ArtificialAnalysisModel[], getOfficial?: OfficialGetter) {
  const estimator = useCostEstimator();
  const { calcInput, calcOutput, calcReasoning, calcCache, calcDays } = estimator;
  const monthlyCosts = useMemo(() => {
    const opts = {
      dailyInput: calcInput * 1_000_000,
      dailyOutput: calcOutput * 1_000_000,
      dailyReasoning: calcReasoning * 1_000_000,
      cacheHitRate: calcCache,
      daysPerMonth: calcDays,
    };
    return models.map((model) => calcMonthlyCost(model, opts, getOfficial?.(model)));
  }, [models, calcInput, calcOutput, calcReasoning, calcCache, calcDays, getOfficial]);
  return { ...estimator, monthlyCosts };
}

// ---- CostEstimatorInputs ----
interface CostFieldDef {
  id: string;
  value: string;
  onChange: (v: string) => void;
  label: string;
  unit?: string;
}

/** Table for the estimator fields: display order, state keys, label key, unit. */
const COST_FIELD_DEFS = [
  { id: "dailyInput", setId: "setDailyInput", labelKey: "dailyPromptTokens", unit: "M" },
  { id: "dailyOutput", setId: "setDailyOutput", labelKey: "dailyCompletionTokens", unit: "M" },
  { id: "dailyReasoning", setId: "setDailyReasoning", labelKey: "dailyReasoningTokens", unit: "M" },
  { id: "cacheHitRate", setId: "setCacheHitRate", labelKey: "cacheHitRate", unit: "%" },
  { id: "daysPerMonth", setId: "setDaysPerMonth", labelKey: "daysPerMonth", unit: undefined },
] as const;

function getCostFields(state: CostInputState, t: TFunction): CostFieldDef[] {
  return COST_FIELD_DEFS.map((def) => ({
    id: def.id,
    value: state[def.id],
    onChange: state[def.setId],
    label: t(def.labelKey),
    unit: def.unit,
  }));
}

/** Official-rates getter bound to the pricing query; shared by every estimator. */
export function useOfficialGetter(): OfficialGetter | undefined {
  const officialQ = qOfficialPricing.use();
  return useMemo(() => {
    if (!officialQ.data) return undefined;
    const index = indexOfficialPricing(officialQ.data.models);
    return (m: ArtificialAnalysisModel) => matchOfficialPricing(index, m);
  }, [officialQ.data]);
}

interface CostEstimatorInputsProps {
  state: CostInputState;
  layout?: "input-label" | "label-input-unit";
  avgCost?: number;
}

/** Number input shared by both estimator layouts (validation flag included). */
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
  const invalid = field.value.trim() !== "" && !Number.isFinite(Number(field.value));
  return (
    <Input
      id={`cost-${field.id}`}
      type="number"
      value={field.value}
      onChange={(e) => field.onChange(e.target.value)}
      aria-invalid={invalid || undefined}
      aria-label={ariaLabel}
      placeholder={placeholder}
      className={className}
    />
  );
}

/**
 * Numeric estimator inputs in two label/input arrangements for screen widths.
 */
export const CostEstimatorInputs = memo(function CostEstimatorInputs({
  state,
  layout = "input-label",
  avgCost,
}: CostEstimatorInputsProps) {
  const { t } = useTranslation();
  // Deps on individual values: the spread state object is new every render.
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
          <div key={field.id} className="flex flex-wrap items-center gap-2 min-w-0 max-w-full">
            <label htmlFor={`cost-${field.id}`} className="text-xs text-text-secondary min-w-0">
              {field.label}
            </label>
            <CostFieldInput field={field} className="w-20 h-9 shrink-0" />
            {field.unit ? (
              <span className="text-xs text-text-secondary shrink-0">{field.unit}</span>
            ) : null}
          </div>
        ) : (
          <div key={field.id} className="flex flex-wrap items-center gap-2 min-w-0 max-w-full">
            <CostFieldInput
              field={field}
              className="w-24 sm:w-28 shrink-0"
              placeholder={field.label}
              aria-label={field.unit ? `${field.label} (${field.unit})` : field.label}
            />
            {/* Visible unit hint as a real <label> for AT association. */}
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

// ---- CostEstimator ----
/** Monthly-cost estimator highlighting the cheapest model. */
export const CostEstimator = memo(function CostEstimator({ models }: { models: ArtificialAnalysisModel[] }) {
  const { t } = useTranslation();
  const theme = useChartTheme();

  const getOfficial = useOfficialGetter();
  const { monthlyCosts, ...inputs } = useMonthlyCosts(models, getOfficial);

  // Cheapest valid estimate; ties all get the mark (unlike computeWinners).
  const bestMonthlyCost = useMemo(() => {
    const valid = monthlyCosts.filter((v): v is number => v !== null);
    return valid.length > 0 ? Math.min(...valid) : null;
  }, [monthlyCosts]);

  return (
    <Card>
      <CardContent padding="md">
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

// ---- PriceChart ----
export const PriceChart = memo(function PriceChart({
  priceRows,
  models,
}: {
  priceRows: CompareRow<ArtificialAnalysisModel>[];
  models: ArtificialAnalysisModel[];
}) {
  const { t } = useTranslation();
  const theme = useChartTheme();

  const data = useMemo(
    () => ({
      labels: priceRows.map((row) => row.label),
      datasets: models.map((model, index) => {
        const color = seriesColor(theme, index);
        return {
          label: model.short_name || model.name,
          data: priceRows.map((row) => {
            const v = row.getNumeric?.(model);
            return typeof v === "number" ? v : null;
          }),
          backgroundColor: hexToRgba(color, 0.85),
          hoverBackgroundColor: color,
          borderRadius: 0,
        };
      }),
    }),
    [priceRows, models, theme],
  );

  const options = useMemo<ChartOptions<"bar">>(
    () => ({
      ...chartBase,
      scales: {
        x: {
          ticks: axisTickStyle(theme),
          grid: { display: false },
          border: axisGridStyle(theme),
        },
        y: {
          ticks: {
            ...axisTickStyle(theme),
            callback: (value) => `$${value}`,
          },
          grid: axisGridStyle(theme),
          border: axisDashedBorderStyle(theme),
        },
      },
      plugins: {
        legend: legendStyle(theme),
        tooltip: {
          ...defaultTooltipOptions(theme),
          callbacks: {
            label: (ctx) => (ctx.parsed.y == null ? "—" : `$${Number(ctx.parsed.y).toFixed(2)}`),
          },
        },
      },
    }),
    [theme],
  );

  return (
    <Card>
      <CardContent padding="md">
        <p className="ui-card-title mb-4">{t("priceComparison")}</p>
        <div className="w-full h-[200px] sm:h-[240px]">
          <figure className="h-full">
            <Bar data={data} options={options} role="img" aria-label={t("priceComparison")} />
          </figure>
        </div>
      </CardContent>
    </Card>
  );
});

// ---- PriceTable ----
const WinnerMark = memo(function WinnerMark() {
  return (
    <span className={cn("inline-flex items-center gap-0.5", "text-xs font-semibold", "text-success ml-1")}>
      <TrendingUp size={10} />
    </span>
  );
});

function PriceValue({
  row,
  model,
  winner,
}: {
  row: CompareRow<ArtificialAnalysisModel>;
  model: ArtificialAnalysisModel;
  winner: "win" | "loss" | null;
}) {
  const { t } = useTranslation();
  const value = row.getNumeric?.(model);
  return typeof value === "number" ? (
    <span className={cn("font-mono", winner === "win" && "font-semibold text-success")}>
      {formatDollar(value, t)}
      {winner === "win" && <WinnerMark />}
    </span>
  ) : (
    <span className="text-text-tertiary">{t("notAvailable")}</span>
  );
}

export const PriceTable = memo(function PriceTable({
  priceRows,
  models,
}: {
  priceRows: CompareRow<ArtificialAnalysisModel>[];
  models: ArtificialAnalysisModel[];
}) {
  const getColor = useModelColorOf();
  return (
    <CompareTable
      rows={priceRows}
      models={models}
      getKey={modelKeyOf}
      getName={modelNameOf}
      getColor={getColor}
      mobileLayout="model-cards"
      renderValue={(row, model, winner) => <PriceValue row={row} model={model} winner={winner} />}
    />
  );
});

// ---- OfficialVsRouterTable ----
interface OfficialRow {
  model: ArtificialAnalysisModel;
  official: OfficialPriceModel;
}

function formatDiff(ratio: number): string {
  return `${ratio >= 0 ? "+" : ""}${(ratio * 100).toFixed(0)}%`;
}

function buildColumns(t: ReturnType<typeof useTranslation>["t"]): DataTableColumn<OfficialRow>[] {
  const priceCell = (get: (row: OfficialRow) => number | null | undefined) => (row: OfficialRow) => (
    <span className="font-mono text-sm">{formatDollar(get(row), t)}</span>
  );
  return [
    {
      id: "model",
      header: t("model"),
      width: "40%",
      cell: (row) => (
        <div className="min-w-0">
          <p className="text-sm font-medium truncate" title={row.model.name}>
            {row.model.short_name || row.model.name}
          </p>
          <p className="text-xs text-text-secondary truncate">{row.official.provider}</p>
        </div>
      ),
    },
    {
      id: "officialIn",
      header: `${t("officialChannel")} ${t("promptPrice")}`,
      align: "right",
      cell: priceCell((row) => row.official.input),
    },
    {
      id: "officialOut",
      header: `${t("officialChannel")} ${t("completionPrice")}`,
      align: "right",
      hiddenMd: true,
      cell: priceCell((row) => row.official.output),
    },
    {
      id: "routerIn",
      header: `${t("openRouterChannel")} ${t("promptPrice")}`,
      align: "right",
      cell: priceCell((row) => row.model.pricing?.input),
    },
    {
      id: "diff",
      header: t("priceDiff"),
      align: "right",
      hiddenMd: true,
      cell: (row) => {
        const official = row.official.input;
        const router = row.model.pricing?.input;
        if (official == null || router == null || official <= 0) {
          return <span className="text-text-tertiary">{t("notAvailable")}</span>;
        }
        return <span className="font-mono text-sm">{formatDiff((router - official) / official)}</span>;
      },
    },
  ];
}

const getRowId = (row: OfficialRow) => modelId(row.model);

/** Official first-party rates vs blended rates. Hidden until loaded / on no match. */
export const OfficialVsRouterTable = memo(function OfficialVsRouterTable({
  models,
}: {
  models: ArtificialAnalysisModel[];
}) {
  const { t } = useTranslation();
  const officialQ = qOfficialPricing.use();
  const getOfficial = useOfficialGetter();
  const columns = useMemo(() => buildColumns(t), [t]);
  const rows = useMemo<OfficialRow[]>(() => {
    if (!getOfficial) return [];
    return models
      .map((model) => {
        const official = getOfficial(model);
        return official ? { model, official } : null;
      })
      .filter((r): r is OfficialRow => r !== null);
  }, [getOfficial, models]);

  if (officialQ.isPending || officialQ.isError || rows.length === 0) return null;
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm font-semibold">{t("officialVsRouter")}</p>
      <DataTable data={rows} columns={columns} getRowId={getRowId} />
    </div>
  );
});
