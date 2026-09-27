<script setup lang="ts">
import { computed } from "vue";
import { cn } from "@/client/utils/cn";

const props = defineProps<{ class?: string }>();
const classes = computed(() => cn("w-full min-w-0 p-5 sm:p-6", props.class));
</script>

<template>
  <div :class="classes">
    <slot />
  </div>
</template>
