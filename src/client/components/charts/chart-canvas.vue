<script setup lang="ts">
/**
 * A Chart.js instance bound to a `canvas`: created on mount, updated in place on data change, destroyed with the
 * component. Diffing in place instead of recreating per render is what keeps a hover from being thrown away on every
 * data tick.
 */
import { onUnmounted, ref, watch } from "vue";
import { Chart, type ChartData, type ChartOptions, type ChartType } from "chart.js";

const props = defineProps<{
  type: ChartType;
  data: ChartData;
  options?: ChartOptions;
}>();

const canvasRef = ref<HTMLCanvasElement | null>(null);

let chart: Chart | null = null;

/**
 * A chart here shows a snapshot, so a data update must land in the same frame. `animation: { duration: 0 }` does that while
 * keeping the animation system alive: `animation: false` also silenced the tooltip, which resolves its own animation from
 * `chart.options.animation`, so hover panels used to appear in one hard step.
 */
function withoutDataAnimation(options: ChartOptions): ChartOptions {
  return { ...options, animation: { duration: 0 } };
}

function create(): void {
  chart?.destroy();
  chart = null;
  const canvas = canvasRef.value;
  if (!canvas) return;
  chart = new Chart(canvas, {
    type: props.type,
    data: props.data,
    options: withoutDataAnimation(props.options ?? {}),
  });
}

function update(): void {
  if (!chart) return;
  chart.data = props.data;
  if (props.options) chart.options = withoutDataAnimation(props.options);
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
