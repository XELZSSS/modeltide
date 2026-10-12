<script setup lang="ts">
import { computed } from "vue";
import { gridClasses } from "./grid-classes";

const props = withDefaults(defineProps<{ columns?: 2 | 4; class?: string }>(), { columns: 4 });
const classes = computed(() => gridClasses("stat", props.columns, props.class));
</script>

<template>
  <div :class="classes">
    <slot />
  </div>
</template>
