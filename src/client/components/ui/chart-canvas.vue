<script setup lang="ts">
import { onUnmounted, ref, watch } from "vue";
import { Chart, type ChartData, type ChartOptions, type ChartType, type Plugin } from "chart.js";

const props = defineProps<{
  type: ChartType;
  data: ChartData;
  options?: ChartOptions;
  plugins?: Plugin[];
}>();

const canvasRef = ref<HTMLCanvasElement | null>(null);

let chart: Chart | null = null;

function create(): void {
  chart?.destroy();
  chart = null;
  const canvas = canvasRef.value;
  if (!canvas) return;
  chart = new Chart(canvas, {
    type: props.type,
    data: props.data,
    options: props.options,
    plugins: props.plugins,
  });
}

function update(): void {
  if (!chart) return;
  if (props.plugins) {
    // Theme-only changes flow through update(), not destroy()+recreate.
    (chart.config as { plugins?: Plugin[] }).plugins = props.plugins;
  }
  chart.data = props.data;
  if (props.options) chart.options = props.options;
  chart.update();
}

watch(() => props.type, create, { flush: "post" });

// Shallow watching avoids deep-traversing chart data; plugins update in place.
watch([() => props.data, () => props.options, () => props.plugins], update, { flush: "post" });

watch(canvasRef, (canvas) => {
  if (canvas) create();
});

onUnmounted(() => {
  chart?.destroy();
  chart = null;
});
</script>

<template>
  <canvas ref="canvasRef" />
</template>
