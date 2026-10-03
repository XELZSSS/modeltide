<script setup lang="ts">
import { computed } from "vue";
import { cn } from "@/client/utils/cn";
import { CHART_HEIGHT } from "@/client/utils/chart-metrics";

const props = withDefaults(defineProps<{ height?: string; class?: string }>(), { height: CHART_HEIGHT });
const classes = computed(() => cn("w-full min-w-0 overflow-hidden", props.height, props.class));
</script>

<template>
  <div :class="classes">
    <figure class="h-full [&_canvas]:block">
      <slot />
    </figure>
  </div>
</template>
