<script setup lang="ts">
/** The box a chart inside a card gets: fixed height, clipped overflow, and the caller's classes on the outside. */
import { computed } from "vue";
import { cn } from "@/client/utils/cn";
import { CHART_HEIGHT } from "@/client/charts/theme";

const props = withDefaults(defineProps<{ height?: string; class?: string }>(), { height: CHART_HEIGHT });
const classes = computed(() => cn("w-full min-w-0 overflow-hidden", props.height, props.class));
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
