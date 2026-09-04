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
import { CompareTable } from "@/client/features/compare/CompareTable";
import { DataTable, type DataTableColumn } from "@/client/components/data";
import { qOfficialPricing } from "@/client/api/queries";

// ---- client/features/compare/pricing/useCostEstimator.ts ----
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

/** Default estimator inputs: 2M prompt + 1M completion + 2M reasoning tokens/day, 50% cache hits, 22 workdays. */
export const DEFAULT_COST_INPUTS = {
  dailyInput: "2",
  dailyOutput: "1",
  dailyReasoning: "2",
  cacheHitRate: "50",
  daysPerMonth: "22",
} as const;

function useCostEstimator(): CostEstimatorState {
  const [dailyInput, setDailyInput] = useState<string>(DEFAULT_COST_INPUTS.dailyInput);
  const [dailyOutput, setDailyOutput] = useState<string>(DEFAULT_COST_INPUTS.dailyOutput);
  const [dailyReasoning, setDailyReasoning] = useState<string>(DEFAULT_COST_INPUTS.dailyReasoning);
  const [cacheHitRate, setCacheHitRate] = useState<string>(DEFAULT_COST_INPUTS.cacheHitRate);
  const [daysPerMonth, setDaysPerMonth] = useState<string>(DEFAULT_COST_INPUTS.daysPerMonth);

  // Defer parsing so heavy list re-renders don't block typing in the inputs.
  // NOTE: non-numeric input (e.g. "e") parses to NaN → `|| 0` coerces to 0 silently;
  // the input stays visible so the user sees what they typed, and the estimate
  // treats it as zero rather than crashing.
  const deferredInput = useDeferredValue(dailyInput);
  const deferredOutput = useDeferredValue(dailyOutput);
  const deferredReasoning = useDeferredValue(dailyReasoning);
  const deferredCache = useDeferredValue(cacheHitRate);
  const deferredDays = useDeferredValue(daysPerMonth);

  const calcInput = Math.max(0, Number(deferredInput) || 0);
  const calcOutput = Math.max(0, Number(deferredOutput) || 0);
  const calcReasoning = Math.max(0, Number(deferredReasoning) || 0);
  // Cache hit rate is clamped to 0-100% and normalized to a 0..1 fraction for the cost math.
  const calcCache = Math.max(0, Math.min(100, Number(deferredCache) || 0)) / 100;
  const calcDays = Math.max(1, Number(deferredDays) || 0);

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

// ---- client/features/compare/pricing/CostEstimatorInputs.tsx ----
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

// ---- client/features/compare/pricing/CostEstimator.tsx ----
/** Interactive monthly-cost estimator that highlights the cheapest model. */
export const CostEstimator = memo(function CostEstimator({ models }: { models: ArtificialAnalysisModel[] }) {
  const { t } = useTranslation();
  const theme = useChartTheme();

  const officialQ = qOfficialPricing.use();
  const getOfficial = useMemo(() => {
    if (!officialQ.data) return undefined;
    const index = indexOfficialPricing(officialQ.data.models);
    return (m: ArtificialAnalysisModel) => matchOfficialPricing(index, m);
  }, [officialQ.data]);
  const { monthlyCosts, ...inputs } = useMonthlyCosts(models, getOfficial);

  // Cheapest model among valid monthly estimates; compared with approxEq below
  // because costs are derived floats and may not be bit-identical.
  // NOTE: tied cheapest models all get the mark here, while computeWinners()
  // (metric tables) skips all-tied rows — the estimator intentionally highlights
  // every cheapest option since "cheapest" is the question being asked.
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

// ---- client/features/compare/pricing/PriceChart.tsx ----
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
          borderRadius: { topLeft: 4, topRight: 4 },
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
        <p className="text-sm font-semibold mb-3">{t("priceComparison")}</p>
        <div className="w-full h-[220px] sm:h-[200px]">
          <figure className="h-full">
            <Bar data={data} options={options} role="img" aria-label={t("priceComparison")} />
          </figure>
        </div>
      </CardContent>
    </Card>
  );
});

// ---- client/features/compare/pricing/PriceTable.tsx ----
export const WinnerMark = memo(function WinnerMark() {
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
  const theme = useChartTheme();
  return (
    <CompareTable
      rows={priceRows}
      models={models}
      getKey={(m, index) => modelId(m) || `idx-${index}`}
      getName={(m) => m.short_name || m.name}
      getColor={(index) => seriesColor(theme, index)}
      mobileLayout="model-cards"
      renderValue={(row, model, winner) => <PriceValue row={row} model={model} winner={winner} />}
    />
  );
});

// ---- client/features/compare/pricing/OfficialVsRouterTable.tsx ----
interface OfficialRow {
  model: ArtificialAnalysisModel;
  official: OfficialPriceModel;
}

function formatDiff(ratio: number): string {
  return `${ratio >= 0 ? "+" : ""}${(ratio * 100).toFixed(0)}%`;
}

function buildColumns(t: ReturnType<typeof useTranslation>["t"]): DataTableColumn<OfficialRow>[] {
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
      cell: (row) => <span className="font-mono text-sm">{formatDollar(row.official.input, t)}</span>,
    },
    {
      id: "officialOut",
      header: `${t("officialChannel")} ${t("completionPrice")}`,
      align: "right",
      hiddenMd: true,
      cell: (row) => <span className="font-mono text-sm">{formatDollar(row.official.output, t)}</span>,
    },
    {
      id: "routerIn",
      header: `${t("openRouterChannel")} ${t("promptPrice")}`,
      align: "right",
      cell: (row) => <span className="font-mono text-sm">{formatDollar(row.model.pricing?.input, t)}</span>,
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

/**
 * Official first-party rates vs the OpenRouter/AA blended rates for the compared
 * models. Non-blocking: renders nothing until the official dataset loads, and
 * stays hidden when nothing matches (e.g. open-weight models without a first-party API).
 */
export const OfficialVsRouterTable = memo(function OfficialVsRouterTable({
  models,
}: {
  models: ArtificialAnalysisModel[];
}) {
  const { t } = useTranslation();
  const officialQ = qOfficialPricing.use();
  const columns = useMemo(() => buildColumns(t), [t]);
  const rows = useMemo<OfficialRow[]>(() => {
    if (!officialQ.data) return [];
    const index = indexOfficialPricing(officialQ.data.models);
    return models
      .map((model) => {
        const official = matchOfficialPricing(index, model);
        return official ? { model, official } : null;
      })
      .filter((r): r is OfficialRow => r !== null);
  }, [officialQ.data, models]);

  if (officialQ.isPending || officialQ.isError || rows.length === 0) return null;
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm font-semibold">{t("officialVsRouter")}</p>
      <DataTable data={rows} columns={columns} getRowId={getRowId} />
    </div>
  );
});
