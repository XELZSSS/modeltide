<script setup lang="ts">
/** The box a chart inside a card gets: a fixed height and clipped overflow. */
import { computed } from "vue";
import { cn } from "@/client/utils/cn";
import { CHART_HEIGHT } from "@/client/charts/theme";

const props = withDefaults(defineProps<{ height?: string }>(), { height: CHART_HEIGHT });
const classes = computed(() => cn("w-full min-w-0 overflow-hidden", props.height));
</script>

<template>
  <div :class="classes">
    <!-- `relative` is load-bearing: every chart ships a `sr-only` <figcaption>, which is absolutely positioned, and
         without a positioned ancestor here it resolved against the page and grew the document's scroll height by its
         own offset from the top of the page (100vh + that offset, on the home dashboard). -->
    <figure class="relative h-full [&_canvas]:block">
      <slot />
    </figure>
  </div>
</template>
