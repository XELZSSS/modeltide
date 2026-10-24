<script setup lang="ts">
/**
 * The card surface: a hairline box on the card background. `ui-card` owns the look, `cn` takes the caller's classes so
 * a card can be a grid cell, a flex column or a plain block without a second wrapper.
 */
import { computed } from "vue";
import { cn } from "@/client/utils/cn";

const props = defineProps<{ class?: string }>();
const classes = computed(() => cn("ui-card", props.class));
</script>

<template>
  <div :class="classes">
    <slot />
  </div>
</template>
