<script setup lang="ts">
import { computed } from "vue";
import type { ChartOptions } from "chart.js";
import { useTranslation } from "@/client/i18n";
import ChartFrame from "@/client/components/ui/chart-frame.vue";
import { LATENCY_CHART_HEIGHT } from "@/client/components/ui/chart";
import ChartCanvas from "@/client/components/ui/chart-canvas.vue";
import { registerLine } from "@/client/utils/charts-register";
import { cartesianChartOptions, seriesColor, useChartTheme } from "@/client/theme/chart-theme";
import { axisGridStyle, axisTickStyle, lineSeriesStyle } from "@/client/utils/charts";
import { formatTime } from "@/client/utils/format";

registerLine();

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

const props = defineProps<{ samples: { t: number; latencyMs: number | null }[] }>();

const { t, lang } = useTranslation();
const theme = useChartTheme();

const decimated = computed(() => decimateSamples(props.samples));

const data = computed(() => {
  const color = seriesColor(theme.value, 6);
  return {
    labels: decimated.value.map((sample) => formatTime(sample.t, lang.value)),
    datasets: [
      {
        label: t("latencyHistory"),
        data: decimated.value.map((sample) => (sample.latencyMs != null ? sample.latencyMs / 1000 : null)),
        borderColor: color,
        backgroundColor: color,
        ...lineSeriesStyle,
      },
    ],
  };
});

const options = computed<ChartOptions<"line">>(() =>
  cartesianChartOptions<"line">(theme.value, {
    interaction: { mode: "index", intersect: false },
    x: { ticks: { display: false, maxTicksLimit: 8 }, grid: { display: false }, border: axisGridStyle(theme.value) },
    y: { ticks: { ...axisTickStyle(theme.value), callback: (value) => `${value}s` } },
    legend: { display: false },
    tooltip: {
      callbacks: {
        title: (items) => items[0]?.label ?? "",
        label: (ctx) => (ctx.parsed.y == null ? "—" : `${Number(ctx.parsed.y).toFixed(2)}s`),
      },
    },
  }),
);
</script>

<template>
  <ChartFrame :height="LATENCY_CHART_HEIGHT">
    <ChartCanvas type="line" :data="data" :options="options" role="img" :aria-label="t('latencyHistory')" />
  </ChartFrame>
</template>
