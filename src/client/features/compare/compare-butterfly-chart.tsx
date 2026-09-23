import { memo, useMemo } from "react";
import type { ChartOptions } from "chart.js";
import { Bar } from "react-chartjs-2";
import { registerBar } from "@/client/utils/charts-register";

registerBar();
import { useTranslation } from "@/client/providers";
import { ceilToStep, hexToRgba, legendStyle, seriesColor, useChartTheme } from "@/client/theme/chart-theme";
import { Card, CardContent, CardHeader } from "@/client/components/ui/card";
import { ChartFrame } from "@/client/components/ui/chart-frame";
import { axisTickStyle, chartBase, defaultTooltipOptions } from "@/client/utils/charts";
import type { ArtificialAnalysisModel } from "@/shared/types";
import { modelDisplayName } from "@/client/utils/model-utils";
import { buildValueRows } from "./compare-logic";

/** Floor of the value axis' half-range, in index points. */
const AXIS_MAX = 100;
const AXIS_STEP = 20;

/** Split across the zero line so a metric only one model reports still draws a side. */
export const CompareButterflyChart = memo(function CompareButterflyChart({
  models,
}: {
  models: ArtificialAnalysisModel[];
}) {
  const { t } = useTranslation();
  const theme = useChartTheme();
  const compared = useMemo(() => models.slice(0, 2), [models]);
  const rows = useMemo(() => buildValueRows(t, compared), [compared, t]);

  const axisMax = useMemo(() => {
    let peak = AXIS_MAX;
    for (const row of rows) {
      for (const value of row.values) if (value != null) peak = Math.max(peak, Math.abs(value));
    }
    return ceilToStep(peak, AXIS_STEP);
  }, [rows]);

  const data = useMemo(
    () => ({
      labels: rows.map((row) => row.metric),
      datasets: compared.map((model, index) => {
        const color = seriesColor(theme, index);
        const sign = index === 0 ? 1 : -1;
        return {
          label: modelDisplayName(model),
          data: rows.map((row) => {
            const value = row.values[index];
            return value == null ? null : value * sign;
          }),
          backgroundColor: hexToRgba(color, 0.85),
          hoverBackgroundColor: color,
          maxBarThickness: 12,
        };
      }),
    }),
    [compared, rows, theme],
  );

  const options = useMemo<ChartOptions<"bar">>(
    () => ({
      ...chartBase,
      indexAxis: "y",
      // index mode defaults to the x axis; on a horizontal bar that picks the bar end, not the row.
      interaction: { mode: "index", axis: "y", intersect: false },
      scales: {
        x: {
          type: "linear",
          position: "top",
          min: -axisMax,
          max: axisMax,
          border: { dash: [3, 3], color: theme.grid },
          grid: { color: theme.grid },
          ticks: { ...axisTickStyle(theme), stepSize: AXIS_STEP },
        },
        y: {
          type: "category",
          grid: { display: false },
          border: { display: false },
          ticks: { ...axisTickStyle(theme), color: theme.tickSecondary },
        },
      },
      plugins: {
        legend: legendStyle(theme),
        tooltip: {
          ...defaultTooltipOptions(theme),
          // `nearest` anchors the card to the bar under the cursor; the default averages the active elements.
          position: "nearest",
          callbacks: {
            title: (items) => rows[items[0]?.dataIndex ?? -1]?.metric ?? "",
            label: (ctx) => {
              const value = rows[ctx.dataIndex]?.values[ctx.datasetIndex];
              return value == null ? "—" : value.toFixed(1);
            },
          },
        },
      },
    }),
    [axisMax, rows, theme],
  );

  return (
    <Card className="w-full md:w-1/2">
      <CardContent className="h-full">
        <CardHeader title={t("compareValues")} />
        <ChartFrame height="h-[240px] sm:h-[300px]">
          <Bar data={data} options={options} role="img" aria-label={t("compareValues")} />
          <figcaption className="sr-only">
            {rows
              .map(
                (row) =>
                  `${row.metric}: ${row.values
                    .map((value, index) => {
                      const model = compared[index];
                      return `${model ? modelDisplayName(model) : ""} ${value == null ? "—" : value.toFixed(1)}`;
                    })
                    .join(", ")}`,
              )
              .join("; ")}
          </figcaption>
        </ChartFrame>
      </CardContent>
    </Card>
  );
});
