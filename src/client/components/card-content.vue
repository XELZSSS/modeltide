<script setup lang="ts">
import { computed } from "vue";
import { cn } from "@/client/utils/cn";

const props = defineProps<{ class?: string; compact?: boolean }>();
const classes = computed(() => cn("w-full min-w-0", props.compact ? "p-4" : "p-5 sm:p-6", props.class));
</script>

<template>
  <div :class="classes">
    <slot />
  </div>
</template>
