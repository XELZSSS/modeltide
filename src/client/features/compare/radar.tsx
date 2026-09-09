"use client";
import { memo, useMemo } from "react";
import { TrendingDown, TrendingUp } from "lucide-react";
import type { ChartOptions } from "chart.js";
import { Radar } from "react-chartjs-2";
import { registerRadar } from "@/client/utils/charts-register";

registerRadar();
import { useTranslation } from "@/client/providers";
import { useChartTheme } from "@/client/theme/chart-theme";
import { Card, CardContent } from "@/client/components/ui/card";
import { cn } from "@/client/utils/cn";
import {
  axisTickStyle,
  chartBase,
  defaultTooltipOptions,
  hexToRgba,
  legendStyle,
  seriesColor,
} from "@/client/utils/charts";
import type { ArtificialAnalysisModel } from "@/shared/types";
import { buildCompareRows, buildRadarData, radarMaxFor, type CompareRow } from "./logic";
import { CompareTable, modelKeyOf, modelNameOf, useModelColorOf } from "./CompareTable";

const WINNER_STYLE = {
  win: { color: "var(--success)", Icon: TrendingUp },
  loss: { color: "var(--destructive)", Icon: TrendingDown },
} as const;

const MetricValueDisplay = memo(function MetricValueDisplay({
  value,
  winner,
}: {
  value: string;
  winner: "win" | "loss" | null;
}) {
  const style = winner ? WINNER_STYLE[winner] : undefined;
  return (
    <span
      className={cn("font-mono tabular-nums", winner === "win" && "font-semibold")}
      style={style && { color: style.color }}
    >
      {value}
      {style && <style.Icon size={12} className="inline ml-0.5" style={{ color: style.color }} />}
    </span>
  );
});

function renderMetricValue(
  row: CompareRow<ArtificialAnalysisModel>,
  model: ArtificialAnalysisModel,
  winner: "win" | "loss" | null,
) {
  return <MetricValueDisplay value={row.getValue?.(model) ?? ""} winner={winner} />;
}

const MetricCompareTable = memo(function MetricCompareTable({
  rows,
  models,
}: {
  rows: CompareRow<ArtificialAnalysisModel>[];
  models: ArtificialAnalysisModel[];
}) {
  const getColor = useModelColorOf();
  return (
    <CompareTable
      rows={rows}
      models={models}
      getKey={modelKeyOf}
      getName={modelNameOf}
      getColor={getColor}
      renderValue={renderMetricValue}
    />
  );
});

export function CompareContent({ models }: { models: ArtificialAnalysisModel[] }) {
  const { t } = useTranslation();
  const theme = useChartTheme();
  const rows = useMemo(() => buildCompareRows(t), [t]);
  const radarData = useMemo(() => buildRadarData(t, models), [models, t]);
  const radarMax = useMemo(() => radarMaxFor(radarData), [radarData]);

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
          max: radarMax,
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
    [theme, radarMax],
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
