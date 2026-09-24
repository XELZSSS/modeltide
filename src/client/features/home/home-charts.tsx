import { memo, useMemo } from "react";
import { type ChartOptions, type Plugin } from "chart.js";
import { Line } from "react-chartjs-2";
import { useTranslation } from "@/client/providers";
import { Card, CardContent, CardHeader } from "@/client/components/ui/card";
import { ChartEmpty, ChartFrame } from "@/client/components/ui/chart-frame";
import { modelDisplayName, shortModelId } from "@/client/utils/model-utils";
import { registerLine } from "@/client/utils/charts-register";

registerLine();
import { useChartTheme, cartesianChartOptions, seriesColor, hexToRgba } from "@/client/theme/chart-theme";
import { axisTickStyle, lineSeriesStyle } from "@/client/utils/charts";
import type { ArtificialAnalysisModel } from "@/shared/types";
import {
  SERIES_KEYS,
  SERIES_LABEL_KEYS,
  INDEX_AXIS_MAX,
  INDEX_AXIS_STEP,
  buildIndexRows,
  formatIndexValue,
  indexAxisX,
} from "./index-series";

const AREA_FILL_ALPHA = 0.2;
const CHART_HEIGHT_CLASS = "h-[200px] sm:h-[240px]";

const tickLabel = (value: string | number): string => formatIndexValue(Number(value));

function bottomRule(color: string): Plugin<"line"> {
  return {
    id: "indexAreaBottomRule",
    afterDatasetsDraw(chart) {
      const { ctx, chartArea } = chart;
      const y = Math.round(chartArea.bottom) + 0.5;
      ctx.save();
      ctx.beginPath();
      ctx.lineWidth = 1;
      ctx.strokeStyle = color;
      ctx.moveTo(chartArea.left, y);
      ctx.lineTo(chartArea.right, y);
      ctx.stroke();
      ctx.restore();
    },
  };
}

export const IndexAreaChart = memo(function IndexAreaChart({ models }: { models: ArtificialAnalysisModel[] }) {
  const { t } = useTranslation();
  const theme = useChartTheme();
  const rows = useMemo(() => buildIndexRows(models), [models]);
  const plugins = useMemo(() => [bottomRule(theme.grid)], [theme]);
  const labels = useMemo(() => rows.map((m) => m.short_name || shortModelId(m.name) || m.id || "—"), [rows]);

  const data = useMemo(
    () => ({
      datasets: SERIES_KEYS.map((key, slot) => {
        const color = seriesColor(theme, slot);
        return {
          label: t(SERIES_LABEL_KEYS[slot]!),
          data: rows.map((m, i) => ({ x: indexAxisX(i, rows.length), y: m[key] })),
          borderColor: color,
          backgroundColor: hexToRgba(color, AREA_FILL_ALPHA),
          fill: true,
          ...lineSeriesStyle,
        };
      }),
    }),
    [rows, t, theme],
  );

  const options = useMemo<ChartOptions<"line">>(
    () =>
      cartesianChartOptions<"line", "linear">(theme, {
        interaction: { mode: "index", intersect: false },
        x: {
          type: "linear",
          min: 0,
          max: INDEX_AXIS_MAX,
          ticks: { ...axisTickStyle(theme), stepSize: INDEX_AXIS_STEP, callback: tickLabel },
        },
        y: {
          min: 0,
          max: INDEX_AXIS_MAX,
          ticks: { ...axisTickStyle(theme), stepSize: INDEX_AXIS_STEP, callback: tickLabel },
        },
        tooltip: {
          callbacks: {
            title: (items) => labels[items[0]?.dataIndex ?? -1] ?? "",
            label: (ctx) => {
              const y = ctx.parsed.y;
              return `${ctx.dataset.label}: ${y == null ? "—" : formatIndexValue(Number(y))}`;
            },
          },
        },
      }),
    [theme, labels],
  );

  return (
    <Card>
      <CardContent>
        <CardHeader title={t("intelligenceIndex")} subtitle={t("artificialSource")} />
        {rows.length === 0 ? (
          <ChartEmpty className={CHART_HEIGHT_CLASS}>{t("noRankingsData")}</ChartEmpty>
        ) : (
          <ChartFrame>
            <Line data={data} options={options} plugins={plugins} aria-label={t("intelligenceIndex")} role="img" />
            <figcaption className="sr-only">
              {rows
                .map(
                  (m) =>
                    `${modelDisplayName(m)}: ${SERIES_KEYS.map(
                      (key, slot) => `${t(SERIES_LABEL_KEYS[slot]!)} ${formatIndexValue(m[key])}`,
                    ).join(", ")}`,
                )
                .join("; ")}
            </figcaption>
          </ChartFrame>
        )}
      </CardContent>
    </Card>
  );
});
