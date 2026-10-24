<script setup lang="ts">
/** A row of stat cards: fixed at two or four columns, two on a phone either way. */
import { computed } from "vue";
import { cn } from "@/client/utils/cn";

const STAT_GRID_COLS = { 2: "grid-cols-2", 4: "grid-cols-2 md:grid-cols-4" } as const;

const props = withDefaults(defineProps<{ columns?: 2 | 4; class?: string }>(), { columns: 4 });
const classes = computed(() => cn("grid gap-3 sm:gap-4", STAT_GRID_COLS[props.columns], props.class));
</script>

<template>
  <div :class="classes">
    <slot />
  </div>
</template>
