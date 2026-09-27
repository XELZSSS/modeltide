<script setup lang="ts">
import { computed } from "vue";
import { cn } from "@/client/utils/cn";

const props = defineProps<{ class?: string }>();
const classes = computed(() => cn("inline-flex max-w-full items-center gap-5 border-b border-border", props.class));
</script>

<template>
  <div :class="classes">
    <slot />
  </div>
</template>
