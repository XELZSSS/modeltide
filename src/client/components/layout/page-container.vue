<script setup lang="ts">
/**
 * The page column: shared max width, the responsive gutter and the vertical rhythm every view starts from. A page passes
 * only what makes it different (`class`), never the width or the gutter.
 */
import { computed } from "vue";
import { cn } from "@/client/utils/cn";
import { PAGE_GUTTER, PAGE_WIDTH } from "@/client/nav/layout";

const props = defineProps<{ class?: string }>();
const classes = computed(() => cn(PAGE_WIDTH, PAGE_GUTTER, "pt-6 pb-8 sm:pt-9", props.class));
</script>

<template>
  <div :class="classes">
    <slot />
  </div>
</template>
