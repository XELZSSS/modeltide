<script setup lang="ts">
import { computed } from "vue";
import { cn } from "@/client/utils/cn";

const props = defineProps<{ label: string; class?: string }>();
const classes = computed(() =>
  cn(
    "flex flex-row items-baseline justify-between min-w-0 py-1.5 gap-3 border-b border-border/60 last:border-0",
    props.class,
  ),
);
</script>

<template>
  <div :class="classes">
    <p class="ui-caption shrink-0">{{ label }}</p>
    <div class="ui-mono-value min-w-0 text-right font-medium break-words md:truncate"><slot /></div>
  </div>
</template>
