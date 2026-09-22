import { memo, useMemo } from "react";
import { type ChartOptions } from "chart.js";
import { Line } from "react-chartjs-2";
import { useTranslation } from "@/client/providers";
import { Card, CardContent, CardHeader } from "@/client/components/ui/card";
import { ChartFrame } from "@/client/components/ui/chart-frame";
import { modelDisplayName, shortModelId } from "@/client/utils/model-utils";
import { registerLine } from "@/client/utils/charts-register";

registerLine();
import { useChartTheme, ceilToStep, legendStyle, seriesColor } from "@/client/theme/chart-theme";
import {
  defaultTooltipOptions,
  chartBase,
  axisTickStyle,
  axisGridStyle,
  axisDashedBorderStyle,
  lineSeriesStyle,
} from "@/client/utils/charts";
import type { ArtificialAnalysisModel } from "@/shared/types";

const SERIES_KEYS = ["intelligence_index", "coding_index", "agentic_index"] as const;
const SERIES_LABEL_KEYS = ["intelligence", "coding", "agentic"] as const;

export const IndexLineChart = memo(function IndexLineChart({ models }: { models: ArtificialAnalysisModel[] }) {
  const { t } = useTranslation();
  const theme = useChartTheme();
  const top10 = useMemo(
    () =>
      [...models]
        .filter((m): m is ArtificialAnalysisModel & { intelligence_index: number } => m.intelligence_index != null)
        .sort((a, b) => b.intelligence_index - a.intelligence_index)
        .slice(0, 10),
    [models],
  );

  const data = useMemo(
    () => ({
      labels: top10.map((m) => m.short_name || shortModelId(m.name) || m.id || "—"),
      datasets: SERIES_KEYS.map((key, slot) => {
        const color = seriesColor(theme, slot);
        return {
          label: t(SERIES_LABEL_KEYS[slot]!),
          data: top10.map((m) => m[key] ?? null),
          borderColor: color,
          backgroundColor: color,
          ...lineSeriesStyle,
        };
      }),
    }),
    [top10, t, theme],
  );

  const yMax = useMemo(() => {
    let peak = 100;
    for (const m of top10) {
      for (const k of SERIES_KEYS) {
        const v = m[k];
        if (typeof v === "number" && Number.isFinite(v) && v > peak) peak = v;
      }
    }
    return ceilToStep(peak, 20);
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

  return (
    <Card>
      <CardContent>
        <CardHeader title={t("intelligenceIndex")} subtitle={t("artificialSource")} />
        {top10.length === 0 ? (
          <div
            className="flex h-[200px] sm:h-[240px] items-center justify-center text-center ui-body-secondary"
            role="status"
          >
            {t("noRankingsData")}
          </div>
        ) : (
          <ChartFrame>
            <Line data={data} options={options} aria-label={t("intelligenceIndex")} role="img" />
            <figcaption className="sr-only">
              {top10.map((m) => `${modelDisplayName(m)}: ${Math.round(m.intelligence_index ?? 0)}`).join(", ")}
            </figcaption>
          </ChartFrame>
        )}
      </CardContent>
    </Card>
  );
});
