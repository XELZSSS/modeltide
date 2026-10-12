<script setup lang="ts">
import { computed } from "vue";
import { gridClasses } from "./grid-classes";

const props = defineProps<{ class?: string }>();
const classes = computed(() => gridClasses("info", 4, props.class));
</script>

<template>
  <div :class="classes">
    <slot />
  </div>
</template>
