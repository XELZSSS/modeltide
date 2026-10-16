<script setup lang="ts">
import { computed } from "vue";
import { infoGridClasses } from "./grid-classes";

const props = defineProps<{ class?: string }>();
const classes = computed(() => infoGridClasses(props.class));
</script>

<template>
  <div :class="classes">
    <slot />
  </div>
</template>
