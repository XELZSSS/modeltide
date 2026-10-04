<script setup lang="ts">
import { computed } from "vue";
import { cn } from "@/client/utils/cn";
import { PAGE_GUTTER, PAGE_WIDTH } from "@/client/config/layout";

const props = defineProps<{ class?: string }>();
const classes = computed(() => cn(PAGE_WIDTH, PAGE_GUTTER, "py-8 sm:py-12", props.class));
</script>

<template>
  <div :class="classes">
    <slot />
  </div>
</template>
