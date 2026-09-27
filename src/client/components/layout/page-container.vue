<script setup lang="ts">
import { computed } from "vue";
import { cn } from "@/client/utils/cn";

const props = defineProps<{ class?: string }>();
const classes = computed(() => cn("max-w-7xl mx-auto px-5 sm:px-8 lg:px-10 py-8 sm:py-12", props.class));
</script>

<template>
  <div :class="classes">
    <slot />
  </div>
</template>
