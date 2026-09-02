import { memo, useMemo } from "react";
import type { ChartOptions } from "chart.js";
import { Bar } from "react-chartjs-2";
import type { ArtificialAnalysisModel } from "@/shared/types";
import { Card, CardContent } from "@/client/components/ui/card";
import { useTranslation } from "@/client/providers";
import { useChartTheme } from "@/client/ui-hooks";
import {
  axisDashedBorderStyle,
  axisGridStyle,
  axisTickStyle,
  chartBase,
  defaultTooltipOptions,
  hexToRgba,
  legendStyle,
  seriesColor,
} from "@/client/utils/charts";
import type { CompareRow } from "@/client/features/compare/logic";

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
