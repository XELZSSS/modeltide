<script lang="ts">
import { registerBar } from "@/client/utils/charts-register";

registerBar();
</script>

<script setup lang="ts">
import { computed } from "vue";
import type { ChartData, ChartOptions } from "chart.js";
import { useTranslation } from "@/client/i18n";
import {
  AXIS_MAX,
  AXIS_STEP,
  ceilToStep,
  hexToRgba,
  legendStyle,
  seriesColor,
  useChartTheme,
} from "@/client/theme/chart-theme";
import Card from "@/client/components/ui/card.vue";
import CardContent from "@/client/components/ui/card-content.vue";
import CardHeader from "@/client/components/ui/card-header.vue";
import ChartCanvas from "@/client/components/ui/chart-canvas.vue";
import ChartFrame from "@/client/components/ui/chart-frame.vue";
import { BUTTERFLY_CHART_HEIGHT } from "@/client/utils/chart-metrics";
import { axisTickStyle, chartBase, defaultTooltipOptions } from "@/client/utils/charts";
import type { ArtificialAnalysisModel } from "@/shared/types";
import { modelDisplayName } from "@/shared/utils/models";
import { buildValueRows } from "@/client/utils/compare-logic";

const props = defineProps<{ models: ArtificialAnalysisModel[] }>();

const { t } = useTranslation();
const theme = useChartTheme();

const compared = computed(() => props.models.slice(0, 2));
const rows = computed(() => buildValueRows(t, compared.value));

const axisMax = computed(() => {
  let peak = AXIS_MAX;
  for (const row of rows.value) {
    for (const value of row.values) if (value != null) peak = Math.max(peak, Math.abs(value));
  }
  return ceilToStep(peak, AXIS_STEP);
});

const data = computed<ChartData<"bar">>(() => ({
  labels: rows.value.map((row) => row.metric),
  datasets: compared.value.map((model, index) => {
    const color = seriesColor(theme.value, index);
    const sign = index === 0 ? 1 : -1;
    return {
      label: modelDisplayName(model),
      data: rows.value.map((row) => {
        const value = row.values[index];
        return value == null ? null : value * sign;
      }),
      backgroundColor: hexToRgba(color, 0.85),
      hoverBackgroundColor: color,
      maxBarThickness: 12,
    };
  }),
}));

const options = computed<ChartOptions<"bar">>(() => ({
  ...chartBase,
  indexAxis: "y",
  interaction: { mode: "index", axis: "y", intersect: false },
  scales: {
    x: {
      type: "linear",
      position: "top",
      min: -axisMax.value,
      max: axisMax.value,
      border: { dash: [3, 3], color: theme.value.grid },
      grid: { color: theme.value.grid },
      ticks: {
        ...axisTickStyle(theme.value),
        stepSize: AXIS_STEP,
        callback: (value) => String(Math.abs(Number(value))),
      },
    },
    y: {
      type: "category",
      grid: { display: false },
      border: { display: false },
      ticks: { ...axisTickStyle(theme.value), color: theme.value.tickSecondary },
    },
  },
  plugins: {
    legend: legendStyle(theme.value),
    tooltip: {
      ...defaultTooltipOptions(theme.value),
      position: "nearest",
      callbacks: {
        title: (items) => rows.value[items[0]?.dataIndex ?? -1]?.metric ?? "",
        label: (ctx) => {
          const value = rows.value[ctx.dataIndex]?.values[ctx.datasetIndex];
          return value == null ? "—" : value.toFixed(1);
        },
      },
    },
  },
}));

const caption = computed(() =>
  rows.value
    .map(
      (row) =>
        `${row.metric}: ${row.values
          .map((value, index) => {
            const model = compared.value[index];
            return `${model ? modelDisplayName(model) : ""} ${value == null ? "—" : value.toFixed(1)}`;
          })
          .join(", ")}`,
    )
    .join("; "),
);
</script>

<template>
  <Card class="w-full md:w-1/2">
    <CardContent class="h-full">
      <CardHeader :title="t('compareValues')" />
      <ChartFrame :height="BUTTERFLY_CHART_HEIGHT">
        <ChartCanvas type="bar" :data="data" :options="options" role="img" :aria-label="t('compareValues')" />
        <figcaption class="sr-only">{{ caption }}</figcaption>
      </ChartFrame>
    </CardContent>
  </Card>
</template>
