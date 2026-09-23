import { memo, useMemo } from "react";
import { type ChartOptions } from "chart.js";
import { Line } from "react-chartjs-2";
import { useTranslation } from "@/client/providers";
import { ChartFrame } from "@/client/components/ui/chart-frame";
import { registerLine } from "@/client/utils/charts-register";

registerLine();
import { cartesianChartOptions, seriesColor, useChartTheme } from "@/client/theme/chart-theme";
import { axisGridStyle, axisTickStyle, lineSeriesStyle } from "@/client/utils/charts";
import { ONE_HOUR } from "@/shared/config";

const BEIJING_OFFSET_MS = 8 * ONE_HOUR;
const formatBeijingHHMM = (ts: number): string => new Date(ts + BEIJING_OFFSET_MS).toISOString().slice(11, 16);

function decimateSamples<T extends { t: number; latencyMs?: number | null }>(samples: T[], max = 300): T[] {
  if (samples.length <= max) return samples;
  const bucketSize = samples.length / max;
  const out: T[] = [];
  for (let i = 0; i < max; i++) {
    const bucket = samples.slice(Math.floor(i * bucketSize), Math.floor((i + 1) * bucketSize));
    out.push(bucket.reduce((best, cur) => ((cur.latencyMs ?? -1) > (best.latencyMs ?? -1) ? cur : best)));
  }
  return out;
}

export const LatencyChart = memo(function LatencyChart({
  samples,
}: {
  samples: { t: number; latencyMs: number | null }[];
}) {
  const { t } = useTranslation();
  const theme = useChartTheme();
  const decimated = useMemo(() => decimateSamples(samples), [samples]);

  const latencyColor = seriesColor(theme, 6);
  const data = useMemo(
    () => ({
      labels: decimated.map((s) => formatBeijingHHMM(s.t)),
      datasets: [
        {
          label: `${t("latencyHistory")} (GMT+8)`,
          data: decimated.map((s) => (s.latencyMs != null ? s.latencyMs / 1000 : null)),
          borderColor: latencyColor,
          backgroundColor: latencyColor,
          ...lineSeriesStyle,
        },
      ],
    }),
    [decimated, t, latencyColor],
  );

  const options = useMemo<ChartOptions<"line">>(
    () =>
      cartesianChartOptions<"line">(theme, {
        interaction: { mode: "index", intersect: false },
        x: { ticks: { display: false, maxTicksLimit: 8 }, grid: { display: false }, border: axisGridStyle(theme) },
        y: { ticks: { ...axisTickStyle(theme), callback: (value) => `${value}s` } },
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: (items) => items[0]?.label ?? "",
            label: (ctx) => (ctx.parsed.y == null ? "—" : `${Number(ctx.parsed.y).toFixed(2)}s`),
          },
        },
      }),
    [theme],
  );

  return (
    <ChartFrame height="h-[200px]">
      <Line data={data} options={options} role="img" aria-label={t("latencyHistory")} />
    </ChartFrame>
  );
});
