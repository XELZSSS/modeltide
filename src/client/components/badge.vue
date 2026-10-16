<script setup lang="ts">
import { computed } from "vue";
import { cn } from "@/client/utils/cn";

const props = defineProps<{ class?: string }>();

const classes = computed(() =>
  cn(
    "inline-flex items-center gap-1 text-xs font-medium uppercase tracking-label leading-5 px-2 py-0.5 transition-colors border border-border text-text-secondary bg-bg-secondary/60",
    props.class,
  ),
);
</script>

<template>
  <span :class="classes">
    <slot />
  </span>
</template>
