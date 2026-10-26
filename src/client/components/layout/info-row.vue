<script setup lang="ts">
/**
 * One label/value line: the label is a caption and never shrinks, the value is monospaced, right-aligned and truncates
 * on desktop, so a long model id cannot push the label out of the row.
 */
import { computed } from "vue";
import { cn } from "@/client/utils/cn";

defineProps<{ label: string }>();
const classes = computed(() =>
  cn("flex min-w-0 flex-row items-baseline justify-between gap-3 border-b border-border/60 py-1.5 last:border-0"),
);
</script>

<template>
  <div :class="classes">
    <p class="shrink-0 ui-caption">{{ label }}</p>
    <div class="min-w-0 text-right ui-mono-value font-medium break-words md:truncate" v-tooltip><slot /></div>
  </div>
</template>
