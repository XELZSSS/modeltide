import { memo, useMemo } from "react";
import { TrendingUp, TrendingDown } from "lucide-react";
import { type ChartOptions } from "chart.js";
import { Radar } from "react-chartjs-2";
import { Card, CardContent } from "@/client/components/ui";
import { CompareTable } from "./CompareTable";
import type { CompareRow } from "./logic";
import { useTranslation } from "@/client/providers";
import { modelId, cn } from "@/client/utils";
import { hexToRgba, getModelColor } from "@/client/utils/charts";
import "@/client/utils/charts";
import { useChartTheme } from "@/client/hooks";
import { defaultTooltipOptions } from "@/client/utils/charts";
import { buildCompareRows, buildRadarData } from "./logic";
import type { ArtificialAnalysisModel } from "@/shared/types";
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
  return (
    <CompareTable
      rows={rows}
      models={models}
      getKey={(m) => modelId(m)}
      getName={(m) => m.short_name || m.name}
      getColor={getModelColor}
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
        const color = theme.palette[index % theme.palette.length]!;
        return {
          label: model.short_name || model.name,
          // Polygons stay identifiable: series colors match the table column colors.
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
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: { mode: "index", intersect: false },
      layout: { padding: 8 },
      scales: {
        r: {
          min: 0,
          max: 100,
          ticks: {
            color: theme.tick,
            font: { size: 10 },
            stepSize: 25,
            backdropColor: "transparent",
          },
          grid: { color: theme.grid },
          angleLines: { color: theme.grid },
          pointLabels: { color: theme.tickSecondary, font: { size: 11 } },
        },
      },
      plugins: {
        legend: { labels: { color: theme.tickSecondary, font: { size: 12 } } },
        tooltip: defaultTooltipOptions(theme),
      },
    }),
    [theme],
  );

  return (
    // Chart and table each get one card frame; CompareTable brings its own.
    <div className="flex flex-col md:flex-row gap-4 sm:gap-6 md:items-stretch">
      <Card className="w-full md:w-1/2">
        <CardContent padding="md" className="h-full flex items-center justify-center">
          <div className="w-full h-[240px] sm:h-[320px]">
            <Radar data={data} options={options} />
          </div>
        </CardContent>
      </Card>
      <div className="min-w-0 w-full md:w-1/2 flex flex-col">
        <MetricCompareTable rows={rows} models={models} />
      </div>
    </div>
  );
}
