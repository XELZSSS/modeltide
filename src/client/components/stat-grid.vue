<script setup lang="ts">
import { computed } from "vue";
import { statGridClasses } from "./grid-classes";

const props = withDefaults(defineProps<{ columns?: 2 | 4; class?: string }>(), { columns: 4 });
const classes = computed(() => statGridClasses(props.columns, props.class));
</script>

<template>
  <div :class="classes">
    <slot />
  </div>
</template>
