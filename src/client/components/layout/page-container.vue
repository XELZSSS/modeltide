<script setup lang="ts">
import { computed } from "vue";
import { cn } from "@/client/utils/cn";
import { PAGE_GUTTER, PAGE_WIDTH } from "@/client/nav/layout";

const props = defineProps<{ class?: string }>();
const classes = computed(() => cn(PAGE_WIDTH, PAGE_GUTTER, "pt-6 sm:pt-9 pb-8", props.class));
</script>

<template>
  <div :class="classes">
    <slot />
  </div>
</template>
