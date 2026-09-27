<script setup lang="ts">
import { computed } from "vue";
import { cn } from "@/client/utils/cn";

const props = defineProps<{ class?: string }>();
const classes = computed(() => cn("grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4", props.class));
</script>

<template>
  <div :class="classes">
    <slot />
  </div>
</template>
