import { memo, useMemo } from "react";
import { type ChartOptions } from "chart.js";
import { Line } from "react-chartjs-2";
import { useTranslation } from "@/client/providers";
import { Card, CardContent } from "@/client/components/ui";
import { EmptyState } from "@/client/components/shared";
import { shortModelId } from "@/client/utils";
import "@/client/utils/charts";
import { useChartTheme } from "@/client/hooks";
import {
  defaultTooltipOptions,
  chartBase,
  axisTickStyle,
  axisGridStyle,
  axisDashedBorderStyle,
  legendStyle,
  lineSeriesStyle,
  seriesColor,
} from "@/client/utils/charts";
import type { ArtificialAnalysisModel } from "@/shared/types";

/**
 * Top-10 models by intelligence index, plotting coding + agentic indices.
 * Y-axis grows past 100 with the data; empty renders an EmptyState.
 */
export const IndexLineChart = memo(function IndexLineChart({ models }: { models: ArtificialAnalysisModel[] }) {
  const { t } = useTranslation();
  const theme = useChartTheme();
  const top10 = useMemo(
    () =>
      [...models]
        .filter((m) => m.intelligence_index != null)
        .sort((a, b) => (b.intelligence_index ?? 0) - (a.intelligence_index ?? 0))
        .slice(0, 10),
    [models],
  );

  const data = useMemo(
    () => ({
      labels: top10.map((m) => m.short_name || shortModelId(m.name)),
      datasets: (
        [
          { key: "intelligence_index", label: t("intelligence") },
          { key: "coding_index", label: t("coding") },
          { key: "agentic_index", label: t("agentic") },
        ] as const
      ).map((series, slot) => {
        const color = seriesColor(theme, slot);
        return {
          label: series.label,
          data: top10.map((m) => m[series.key] ?? null),
          borderColor: color,
          backgroundColor: color,
          ...lineSeriesStyle,
        };
      }),
    }),
    [top10, t, theme],
  );

  // Clamp the ceiling to the data so above-100 scores aren't clipped.
  const yMax = useMemo(() => {
    let peak = 100;
    for (const m of top10) {
      for (const k of ["intelligence_index", "coding_index", "agentic_index"] as const) {
        const v = m[k];
        if (typeof v === "number" && Number.isFinite(v) && v > peak) peak = v;
      }
    }
    return Math.ceil(peak / 20) * 20;
  }, [top10]);

  const options = useMemo<ChartOptions<"line">>(
    () => ({
      ...chartBase,
      interaction: { mode: "index", intersect: false },
      scales: {
        x: {
          ticks: { display: false },
          grid: axisGridStyle(theme),
          border: axisDashedBorderStyle(theme),
        },
        y: {
          min: 0,
          max: yMax,
          ticks: {
            ...axisTickStyle(theme),
            stepSize: 20,
            callback: (value) => Math.round(Number(value)).toString(),
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
            label: (ctx) => {
              const y = ctx.parsed.y;
              return y == null ? `${ctx.dataset.label}: —` : `${ctx.dataset.label}: ${Math.round(Number(y))}`;
            },
          },
        },
      },
    }),
    [theme, yMax],
  );

  if (top10.length === 0) {
    return (
      <Card>
        <CardContent padding="md">
          <p className="ui-card-title mb-4">{t("intelligenceIndex")}</p>
          <EmptyState message={t("noRankingsData")} />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent padding="md">
        <p className="ui-card-title mb-4">{t("intelligenceIndex")}</p>
        <div className="w-full h-[200px] sm:h-[240px]">
          <figure className="h-full">
            <Line data={data} options={options} aria-label={t("intelligenceIndex")} role="img" />
          </figure>
        </div>
      </CardContent>
    </Card>
  );
});
