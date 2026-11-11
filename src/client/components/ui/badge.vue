<script setup lang="ts">
/** Small label for a tag or a state: `rounded-md` at 12px with a hairline; the caller decides the colour through `class`.
 * `max-w-full` and `overflow-hidden` are an invariant: `whitespace-nowrap` makes min-content equal max-content, so `w-fit`
 * alone does not cap the width. A caller whose text must stay readable gives it a `truncate` child. */
import { computed } from "vue";
import { cn } from "@/client/utils/cn";

const props = defineProps<{ class?: string }>();

const classes = computed(() =>
  cn(
    "inline-flex w-fit max-w-full shrink-0 items-center gap-1 overflow-hidden rounded-md border border-transparent bg-secondary px-2 py-0.5 ui-caption font-medium whitespace-nowrap ui-motion",
    props.class,
  ),
);
</script>

<template>
  <span :class="classes">
    <slot />
  </span>
</template>
