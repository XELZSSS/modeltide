<script lang="ts">
import { registerRadar } from "@/client/utils/charts-register";

registerRadar();
</script>

<script setup lang="ts">
import { computed } from "vue";
import type { ChartData, ChartOptions } from "chart.js";
import { useTranslation } from "@/client/i18n";
import { hexToRgba, legendStyle, seriesColor, useChartTheme } from "@/client/theme/chart-theme";
import Card from "@/client/components/ui/card.vue";
import CardContent from "@/client/components/ui/card-content.vue";
import ChartCanvas from "@/client/components/ui/chart-canvas.vue";
import ChartFrame from "@/client/components/ui/chart-frame.vue";
import { RADAR_CHART_HEIGHT } from "@/client/components/ui/chart";
import { axisTickStyle, chartBase, defaultTooltipOptions } from "@/client/utils/charts";
import type { ArtificialAnalysisModel } from "@/shared/types";
import { modelDisplayName, modelId } from "@/shared/utils/models";
import { buildRadarData, radarMaxFor } from "./compare-logic";

const props = defineProps<{ models: ArtificialAnalysisModel[] }>();

const { t } = useTranslation();
const theme = useChartTheme();

const radarData = computed(() => buildRadarData(t, props.models));
const radarMax = computed(() => radarMaxFor(radarData.value));

const data = computed<ChartData<"radar">>(() => ({
  labels: radarData.value.map((row) => row.metric),
  datasets: props.models.map((model, index) => {
    const color = seriesColor(theme.value, index);
    const key = modelId(model);
    return {
      label: modelDisplayName(model),
      data: radarData.value.map((row) => (key ? (row.values[key] ?? null) : null)),
      borderColor: color,
      backgroundColor: hexToRgba(color, 0.06),
      borderWidth: 2,
      pointRadius: 2,
      pointHoverRadius: 4,
    };
  }),
}));

const options = computed<ChartOptions<"radar">>(() => ({
  ...chartBase,
  interaction: { mode: "index", intersect: false },
  layout: { padding: 8 },
  scales: {
    r: {
      min: 0,
      max: radarMax.value,
      ticks: {
        ...axisTickStyle(theme.value),
        stepSize: 25,
        backdropColor: "transparent",
      },
      grid: { color: theme.value.grid },
      angleLines: { color: theme.value.grid },
      pointLabels: { color: theme.value.tickSecondary, font: { size: 11 } },
    },
  },
  plugins: {
    legend: legendStyle(theme.value),
    tooltip: defaultTooltipOptions(theme.value),
  },
}));

const caption = computed(() =>
  radarData.value
    .map((row) => {
      const values = props.models.map((m) => {
        const key = modelId(m);
        const v = key ? row.values[key] : null;
        return `${modelDisplayName(m)}: ${typeof v === "number" ? v.toFixed(1) : "—"}`;
      });
      return `${row.metric} — ${values.join(", ")}`;
    })
    .join(""),
);
</script>

<template>
  <Card class="w-full md:w-1/2">
    <CardContent class="h-full flex items-center justify-center">
      <ChartFrame :height="RADAR_CHART_HEIGHT">
        <ChartCanvas type="radar" :data="data" :options="options" role="img" :aria-label="t('modelComparison')" />
        <figcaption class="sr-only">{{ caption }}</figcaption>
      </ChartFrame>
    </CardContent>
  </Card>
</template>
