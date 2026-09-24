import { memo, useMemo } from "react";
import type { ChartOptions } from "chart.js";
import { Bar } from "react-chartjs-2";
import { registerBar } from "@/client/utils/charts-register";

registerBar();
import type { ArtificialAnalysisModel } from "@/shared/types";
import { ChartCard, ChartFrame } from "@/client/components/ui/chart-frame";
import { useTranslation } from "@/client/providers";
import { cartesianChartOptions, ceilToStep, hexToRgba, seriesColor, useChartTheme } from "@/client/theme/chart-theme";
import { axisGridStyle, axisTickStyle } from "@/client/utils/charts";
import type { CompareRow } from "@/client/features/compare/compare-logic";
import { modelDisplayName } from "@/client/utils/model-utils";

const PRICE_AXIS_FLOOR = 1;

function priceAxisMax(rows: CompareRow<ArtificialAnalysisModel>[], models: ArtificialAnalysisModel[]): number {
  let peak = 0;
  for (const row of rows) {
    for (const model of models) {
      const value = row.getNumeric?.(model);
      if (typeof value === "number" && Number.isFinite(value)) peak = Math.max(peak, value);
    }
  }
  if (peak <= 0) return PRICE_AXIS_FLOOR;
  return ceilToStep(peak, 10 ** Math.floor(Math.log10(peak)) / 2);
}

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
          label: modelDisplayName(model),
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

  const axisMax = useMemo(() => priceAxisMax(priceRows, models), [priceRows, models]);

  const options = useMemo<ChartOptions<"bar">>(
    () =>
      cartesianChartOptions<"bar">(theme, {
        x: { ticks: axisTickStyle(theme), grid: { display: false }, border: axisGridStyle(theme) },
        y: {
          min: 0,
          max: axisMax,
          ticks: { ...axisTickStyle(theme), callback: (value) => `$${value}` },
        },
        tooltip: {
          callbacks: {
            label: (ctx) => (ctx.parsed.y == null ? "—" : `$${Number(ctx.parsed.y).toFixed(2)}`),
          },
        },
      }),
    [theme, axisMax],
  );

  return (
    <ChartCard title={t("priceComparison")}>
      <ChartFrame>
        <Bar data={data} options={options} role="img" aria-label={t("priceComparison")} />
      </ChartFrame>
    </ChartCard>
  );
});
