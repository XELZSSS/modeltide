<script lang="ts">
import { registerRadar } from "@/client/charts/register";

registerRadar();
</script>

<script setup lang="ts">
import { computed } from "vue";
import { defaults } from "chart.js";
import type { Chart, ChartData, ChartOptions } from "chart.js";
import { useTranslation } from "@/client/i18n";
import { useDevice } from "@/client/device";
import { hexToRgba } from "@/shared/utils/color";
import {
  AXIS_STEP,
  RADAR_CHART_HEIGHT,
  axisTickStyle,
  chartBase,
  legendStyle,
  seriesColor,
  useChartTheme,
} from "@/client/charts/theme";
import Card from "@/client/components/layout/card.vue";
import CardContent from "@/client/components/layout/card-content.vue";
import ChartCanvas from "@/client/components/charts/chart-canvas.vue";
import ChartFrame from "@/client/components/charts/chart-frame.vue";
import type { ArtificialAnalysisModel } from "@/shared/types";
import { modelDisplayName, modelId } from "@/shared/utils/models";
import { formatScore } from "@/shared/utils";
import { buildRadarData, radarMaxFor } from "@/client/utils/compare-logic";

const props = defineProps<{ models: ArtificialAnalysisModel[] }>();

const { t } = useTranslation();
const theme = useChartTheme();
const isMobile = useDevice();

const radarData = computed(() => buildRadarData(t, props.models));
const radarMax = computed(() => radarMaxFor(radarData.value));

const display = computed(() => props.models.map((model) => ({ key: modelId(model), name: modelDisplayName(model) })));

const data = computed<ChartData<"radar">>(() => ({
  labels: radarData.value.map((row) => row.metric),
  datasets: display.value.map(({ key, name }, index) => {
    const color = seriesColor(theme.value, index);
    return {
      label: name,
      data: radarData.value.map((row) => (key ? (row.values[key] ?? null) : null)),
      borderColor: color,
      backgroundColor: hexToRgba(color, 0.06),
      borderWidth: 2,
      // Every vertex is a solid dot in the series colour, at rest and on hover. Inheriting the 6% `backgroundColor` wash
      // left a near-transparent centre that antialiasing rendered as a hollow ring on some vertices and a dot on others.
      pointStyle: "circle",
      pointRadius: 2,
      pointBackgroundColor: color,
      pointBorderColor: color,
      pointHoverRadius: 4,
      pointHoverBackgroundColor: color,
      pointHoverBorderColor: color,
    };
  }),
}));

const legend = computed(() => {
  const style = legendStyle(theme.value);
  return {
    ...style,
    labels: {
      ...style.labels,
      // The radar's dataset `backgroundColor` is the 6% area wash, so Chart.js's default marker fill still read as a
      // ring here. The series' own line colour is what the legend names, so that is what fills the dot.
      generateLabels: (chart: Chart) =>
        defaults.plugins.legend.labels.generateLabels(chart).map((item) => ({
          ...item,
          fillStyle: item.strokeStyle,
        })),
    },
  };
});

const options = computed<ChartOptions<"radar">>(() => ({
  ...chartBase,
  interaction: { mode: "index", intersect: false },
  // 0 left the outermost label flush against the canvas: the polygon is as large as it can be, but a 12-character axis
  // name ("Intelligence") is wider than that slack. 4px of layout padding costs 8px of radius and fits it.
  layout: { padding: isMobile.value ? 4 : 8 },
  scales: {
    r: {
      min: 0,
      max: radarMax.value,
      ticks: {
        ...axisTickStyle(theme.value),
        stepSize: AXIS_STEP,
        backdropColor: "transparent",
      },
      grid: { color: theme.value.grid },
      angleLines: { color: theme.value.grid },
      // Chart.js draws point labels outside the polygon but does not reserve space for them, so a long axis name was
      // clipped by the canvas edge — `padding` is both the gap to the vertex and the only lever that keeps it inside.
      pointLabels: { color: theme.value.tickSecondary, font: { size: isMobile.value ? 10 : 11 }, padding: 4 },
    },
  },
  plugins: {
    legend: legend.value,
    tooltip: { enabled: false },
  },
}));

const caption = computed(() =>
  radarData.value
    .map((row) => {
      const values = display.value.map(({ key, name }) => {
        const v = key ? row.values[key] : null;
        return `${name}: ${typeof v === "number" ? formatScore(v, t) : t("notAvailable")}`;
      });
      return `${row.metric} — ${values.join(", ")}`;
    })
    .join("; "),
);
</script>

<template>
  <Card>
    <CardContent class="flex h-full items-center justify-center p-3 sm:p-6">
      <ChartFrame :height="RADAR_CHART_HEIGHT">
        <ChartCanvas type="radar" :data="data" :options="options" role="img" :aria-label="t('modelComparison')" />
        <figcaption class="sr-only">{{ caption }}</figcaption>
      </ChartFrame>
    </CardContent>
  </Card>
</template>
