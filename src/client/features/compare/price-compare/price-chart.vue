<script lang="ts">
import { registerBar } from "@/client/utils/charts-register";

registerBar();
</script>

<script setup lang="ts">
import { computed } from "vue";
import type { ChartData, ChartOptions } from "chart.js";
import ChartCard from "@/client/components/ui/chart-card.vue";
import ChartCanvas from "@/client/components/ui/chart-canvas.vue";
import ChartFrame from "@/client/components/ui/chart-frame.vue";
import { useTranslation } from "@/client/i18n";
import { cartesianChartOptions, ceilToStep, hexToRgba, seriesColor, useChartTheme } from "@/client/theme/chart-theme";
import { axisGridStyle, axisTickStyle } from "@/client/utils/charts";
import { modelDisplayName } from "@/client/utils/model-utils";
import type { ArtificialAnalysisModel } from "@/shared/types";
import type { CompareRow } from "@/client/features/compare/compare-logic";

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

const props = defineProps<{
  priceRows: CompareRow<ArtificialAnalysisModel>[];
  models: ArtificialAnalysisModel[];
}>();

const { t } = useTranslation();
const theme = useChartTheme();

const data = computed<ChartData<"bar">>(() => ({
  labels: props.priceRows.map((row) => row.label),
  datasets: props.models.map((model, index) => {
    const color = seriesColor(theme.value, index);
    return {
      label: modelDisplayName(model),
      data: props.priceRows.map((row) => {
        const v = row.getNumeric?.(model);
        return typeof v === "number" ? v : null;
      }),
      backgroundColor: hexToRgba(color, 0.85),
      hoverBackgroundColor: color,
      borderRadius: 0,
    };
  }),
}));

const axisMax = computed(() => priceAxisMax(props.priceRows, props.models));

const options = computed<ChartOptions<"bar">>(() =>
  cartesianChartOptions<"bar">(theme.value, {
    x: { ticks: axisTickStyle(theme.value), grid: { display: false }, border: axisGridStyle(theme.value) },
    y: {
      min: 0,
      max: axisMax.value,
      ticks: { ...axisTickStyle(theme.value), callback: (value) => `$${value}` },
    },
    tooltip: {
      callbacks: {
        label: (ctx) => (ctx.parsed.y == null ? "—" : `$${Number(ctx.parsed.y).toFixed(2)}`),
      },
    },
  }),
);
</script>

<template>
  <ChartCard :title="t('priceComparison')">
    <ChartFrame>
      <ChartCanvas type="bar" :data="data" :options="options" role="img" :aria-label="t('priceComparison')" />
    </ChartFrame>
  </ChartCard>
</template>
