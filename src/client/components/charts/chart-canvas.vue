<script setup lang="ts">
import { onUnmounted, ref, watch } from "vue";
import { Chart, type ChartData, type ChartOptions, type ChartType } from "chart.js";

const props = defineProps<{
  type: ChartType;
  data: ChartData;
  options?: ChartOptions;
}>();

const canvasRef = ref<HTMLCanvasElement | null>(null);

let chart: Chart | null = null;

function withoutAnimation(options: ChartOptions): ChartOptions {
  return { ...options, animation: false };
}

function create(): void {
  chart?.destroy();
  chart = null;
  const canvas = canvasRef.value;
  if (!canvas) return;
  chart = new Chart(canvas, {
    type: props.type,
    data: props.data,
    options: withoutAnimation(props.options ?? {}),
  });
}

function update(): void {
  if (!chart) return;
  chart.data = props.data;
  if (props.options) chart.options = withoutAnimation(props.options);
  chart.update("none");
}

watch(() => props.type, create, { flush: "post" });

watch([() => props.data, () => props.options], update, { flush: "post" });

watch(canvasRef, (canvas) => {
  if (canvas) create();
});

onUnmounted(() => {
  chart?.destroy();
  chart = null;
});
</script>

<template>
  <canvas ref="canvasRef" class="ui-anim-fade" />
</template>
