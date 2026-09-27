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

function render(): void {
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

watch(() => [props.type, props.data, props.options, props.plugins], render, { deep: true, flush: "post" });

watch(canvasRef, (canvas) => {
  if (canvas) render();
});

onUnmounted(() => {
  chart?.destroy();
  chart = null;
});
</script>

<template>
  <canvas ref="canvasRef" />
</template>
