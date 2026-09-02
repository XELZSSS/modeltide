import { memo, useMemo } from "react";
import { type ChartOptions } from "chart.js";
import { Bar } from "react-chartjs-2";
import { Card, CardContent } from "@/client/components/ui";
import { hexToRgba } from "@/client/utils/charts";
import "@/client/utils/charts";
import { useChartTheme } from "@/client/hooks";
import { defaultTooltipOptions } from "@/client/utils/charts";
import type { CompareRow } from "../logic";
import { useTranslation } from "@/client/providers";
import type { ArtificialAnalysisModel } from "@/shared/types";

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
        const color = theme.palette[index % theme.palette.length]!;
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
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      scales: {
        x: {
          ticks: { color: theme.tick, font: { size: 10 } },
          grid: { display: false },
          border: { color: theme.grid },
        },
        y: {
          ticks: {
            color: theme.tick,
            font: { size: 10 },
            callback: (value) => `$${value}`,
          },
          grid: { color: theme.grid },
          border: { color: theme.grid, dash: [3, 3] },
        },
      },
      plugins: {
        legend: { labels: { color: theme.tickSecondary, font: { size: 12 } } },
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
          <Bar data={data} options={options} />
        </div>
      </CardContent>
    </Card>
  );
});
