<script setup lang="ts">
import { computed } from "vue";
import { gridClasses } from "./grid-classes";

const props = withDefaults(
  defineProps<{ variant?: "stat" | "info"; columns?: 2 | 4; class?: string }>(),
  { variant: "stat", columns: 4 },
);
const classes = computed(() => gridClasses(props.variant, props.columns, props.class));
</script>

<template>
  <div :class="classes">
    <slot />
  </div>
</template>
