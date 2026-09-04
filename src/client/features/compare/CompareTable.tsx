import { memo, useMemo, type ReactNode } from "react";
import { TrendingUp, TrendingDown } from "lucide-react";
import { type ChartOptions } from "chart.js";
import { Radar } from "react-chartjs-2";
import { useTranslation, useDevice } from "@/client/providers";
import { useChartTheme } from "@/client/hooks";
import { Card, CardContent, Dot } from "@/client/components/ui";
import { cn, modelId } from "@/client/utils";
import {
  hexToRgba,
  chartBase,
  axisTickStyle,
  legendStyle,
  seriesColor,
  defaultTooltipOptions,
} from "@/client/utils/charts";
import { computeWinners, buildCompareRows, buildRadarData, type CompareRow, type Winner } from "./logic";
import type { ArtificialAnalysisModel } from "@/shared/types";

interface ThProps {
  align?: "left" | "right";
  className?: string;
  style?: React.CSSProperties;
  children?: ReactNode;
  scope?: "col" | "row";
}

const Th = memo(function Th({ align = "left", className, style, children, scope }: ThProps) {
  return (
    <th
      scope={scope}
      className={cn(
        "px-4 py-2.5 text-xs font-medium text-text-tertiary",
        align === "right" ? "text-right" : "text-left",
        className,
      )}
      style={style}
    >
      {children}
    </th>
  );
});

interface TdProps {
  align?: "left" | "right";
  mono?: boolean;
  className?: string;
  style?: React.CSSProperties;
  children?: ReactNode;
}

const Td = memo(function Td({ align = "left", mono, className, style, children }: TdProps) {
  return (
    <td
      className={cn("px-4 py-2.5 text-sm", mono && "font-mono tabular-nums", align === "right" && "text-right", className)}
      style={style}
    >
      {children}
    </td>
  );
});

function Tr({ className, children, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr className={cn("border-b border-border last:border-b-0", className)} {...props}>
      {children}
    </tr>
  );
}

interface CompareTableProps<T> {
  rows: CompareRow<T>[];
  models: T[];
  getKey: (m: T, index: number) => string;
  getName: (m: T) => string;
  getColor: (index: number) => string;
  renderValue: (row: CompareRow<T>, model: T, winner: Winner | null) => ReactNode;
  mobileLayout?: "metric-rows" | "model-cards";
}

function DesktopTable<T>({
  rows,
  models,
  getKey,
  getName,
  getColor,
  renderValue,
  winners,
}: {
  rows: CompareRow<T>[];
  models: T[];
  getKey: (m: T, index: number) => string;
  getName: (m: T) => string;
  getColor: (index: number) => string;
  renderValue: (row: CompareRow<T>, model: T, winner: "win" | "loss" | null) => ReactNode;
  winners: Map<string, Map<string, "win" | "loss">>;
}) {
  const { t } = useTranslation();
  return (
    <Card>
      <CardContent padding="md">
        <div className="min-w-0 w-full overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <Th className="font-semibold text-text-secondary sticky left-0 z-10 bg-bg-card">
                  {t("metric")}
                </Th>
                {models.map((model, index) => (
                  <Th
                    key={getKey(model, index)}
                    align="right"
                    className="font-semibold"
                    style={{ color: getColor(index) }}
                  >
                    {getName(model)}
                  </Th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <Tr key={row.id ?? row.label} className="hover:bg-hover transition-colors">
                  <Th scope="row" className="text-text-secondary sticky left-0 bg-bg-card z-10">
                    {row.label}
                  </Th>
                  {models.map((model, index) => (
                    <Td key={getKey(model, index)} align="right">
                      {renderValue(row, model, winners.get(row.id ?? row.label)?.get(getKey(model, index)) ?? null)}
                    </Td>
                  ))}
                </Tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function MobileTable<T>({
  rows,
  models,
  getKey,
  getName,
  getColor,
  renderValue,
  winners,
  layout,
}: {
  rows: CompareRow<T>[];
  models: T[];
  getKey: (m: T, index: number) => string;
  getName: (m: T) => string;
  getColor: (index: number) => string;
  renderValue: (row: CompareRow<T>, model: T, winner: "win" | "loss" | null) => ReactNode;
  winners: Map<string, Map<string, "win" | "loss">>;
  layout: "metric-rows" | "model-cards";
}) {
  if (layout === "model-cards") {
    return (
      <div className="flex flex-col gap-3">
        {models.map((model, index) => (
          <Card key={getKey(model, index)}>
            <CardContent padding="sm" className="flex flex-col gap-3">
              <p className="flex items-center gap-2 text-sm font-medium truncate" style={{ color: getColor(index) }}>
                <Dot size="sm" color={getColor(index)} />
                {getName(model)}
              </p>
              <div className="flex flex-col gap-2">
                {rows.map((row) => (
                  <div key={row.id ?? row.label} className="flex items-center justify-between gap-3">
                    <span className="ui-caption">{row.label}</span>
                    {renderValue(row, model, winners.get(row.id ?? row.label)?.get(getKey(model, index)) ?? null)}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  // One card for all metric rows; the caller must not wrap this in another Card.
  return (
    <Card>
      <CardContent padding="sm">
        <div className="flex flex-col divide-y divide-border">
          {rows.map((row) => {
            const perModel = winners.get(row.id ?? row.label);
            return (
              <div
                key={row.id ?? row.label}
                className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
              >
                <span className="text-xs font-medium text-text-secondary shrink-0">{row.label}</span>
                <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
                  {models.map((model, index) => (
                    <span key={getKey(model, index)} className="flex items-center gap-1">
                      <Dot size="sm" color={getColor(index)} />
                      {renderValue(row, model, perModel?.get(getKey(model, index)) ?? null)}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function CompareTableInner<T>({
  rows,
  models,
  getKey,
  getName,
  getColor,
  renderValue,
  mobileLayout = "metric-rows",
}: CompareTableProps<T>) {
  const { isMobile } = useDevice();
  const winners = useMemo(() => computeWinners(rows, models, getKey), [rows, models, getKey]);

  if (isMobile) {
    return (
      <MobileTable
        rows={rows}
        models={models}
        getKey={getKey}
        getName={getName}
        getColor={getColor}
        renderValue={renderValue}
        winners={winners}
        layout={mobileLayout}
      />
    );
  }

  return (
    <DesktopTable
      rows={rows}
      models={models}
      getKey={getKey}
      getName={getName}
      getColor={getColor}
      renderValue={renderValue}
      winners={winners}
    />
  );
}

/** Comparison table: desktop table + mobile layout (metric-rows or model-cards). */
export const CompareTable = memo(CompareTableInner) as typeof CompareTableInner;

// ---- CompareContent (the /compare page body: radar + metric table) ----
const MetricValueDisplay = memo(function MetricValueDisplay({
  value,
  winner,
}: {
  value: string;
  winner: "win" | "loss" | null;
}) {
  const winnerColor = winner === "win" ? "var(--success)" : winner === "loss" ? "var(--destructive)" : undefined;
  return (
    <span
      className={cn("font-mono tabular-nums", winner === "win" && "font-semibold")}
      style={winnerColor ? { color: winnerColor } : undefined}
    >
      {value}
      {winner === "win" && <TrendingUp size={12} className="inline ml-0.5" style={{ color: "var(--success)" }} />}
      {winner === "loss" && (
        <TrendingDown size={12} className="inline ml-0.5" style={{ color: "var(--destructive)" }} />
      )}
    </span>
  );
});

const MetricCompareTable = memo(function MetricCompareTable({
  rows,
  models,
}: {
  rows: CompareRow<ArtificialAnalysisModel>[];
  models: ArtificialAnalysisModel[];
}) {
  const theme = useChartTheme();
  return (
    <CompareTable
      rows={rows}
      models={models}
      getKey={(m, index) => modelId(m) || `idx-${index}`}
      getName={(m) => m.short_name || m.name}
      getColor={(index) => seriesColor(theme, index)}
      renderValue={(row, model, winner) => <MetricValueDisplay value={row.getValue?.(model) ?? ""} winner={winner} />}
    />
  );
});

export function CompareContent({ models }: { models: ArtificialAnalysisModel[] }) {
  const { t } = useTranslation();
  const theme = useChartTheme();
  const rows = useMemo(() => buildCompareRows(t), [t]);
  const radarData = useMemo(() => buildRadarData(t, models), [models, t]);

  const data = useMemo(
    () => ({
      labels: radarData.map((row) => String(row.metric)),
      datasets: models.map((model, index) => {
        const color = seriesColor(theme, index);
        return {
          label: model.short_name || model.name,
          data: radarData.map((row) => (typeof row[`model_${index}`] === "number" ? row[`model_${index}`] : null)),
          borderColor: color,
          backgroundColor: hexToRgba(color, 0.06),
          borderWidth: 2,
          pointRadius: 2,
          pointHoverRadius: 4,
        };
      }),
    }),
    [radarData, models, theme],
  );

  const options = useMemo<ChartOptions<"radar">>(
    () => ({
      ...chartBase,
      interaction: { mode: "index", intersect: false },
      layout: { padding: 8 },
      scales: {
        r: {
          min: 0,
          max: 100,
          ticks: {
            ...axisTickStyle(theme),
            stepSize: 25,
            backdropColor: "transparent",
          },
          grid: { color: theme.grid },
          angleLines: { color: theme.grid },
          pointLabels: { color: theme.tickSecondary, font: { size: 11 } },
        },
      },
      plugins: {
        legend: legendStyle(theme),
        tooltip: defaultTooltipOptions(theme),
      },
    }),
    [theme],
  );

  return (
    <div className="flex flex-col md:flex-row gap-4 sm:gap-6 md:items-stretch">
      <Card className="w-full md:w-1/2">
        <CardContent padding="md" className="h-full flex items-center justify-center">
          <div className="w-full h-[240px] sm:h-[320px]">
            <figure className="h-full">
              <Radar data={data} options={options} role="img" aria-label={t("modelComparison")} />
            </figure>
          </div>
        </CardContent>
      </Card>
      <div className="min-w-0 w-full md:w-1/2 flex flex-col">
        <MetricCompareTable rows={rows} models={models} />
      </div>
    </div>
  );
}
