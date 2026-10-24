<script setup lang="ts">
/**
 * Small label for a tag or a state: `rounded-md` at 12px with a hairline, the shadcn badge shape. The caller decides the
 * colour through `class`; the default is the muted/secondary pair.
 *
 * `max-w-full` and `overflow-hidden` are an invariant, not a look: a label never paints outside the box that holds it.
 * Both are needed because `whitespace-nowrap` makes min-content equal max-content, so `w-fit` alone does not cap the
 * width and a long upstream tag pushed straight past its card. A caller whose text must stay readable gives it a
 * `truncate` child (see the tag list on the open-source detail page).
 */
import { computed } from "vue";
import { cn } from "@/client/utils/cn";

const props = defineProps<{ class?: string }>();

const classes = computed(() =>
  cn(
    "inline-flex w-fit max-w-full shrink-0 items-center gap-1 overflow-hidden rounded-md border border-transparent bg-secondary px-2 py-0.5 text-xs leading-4 font-medium whitespace-nowrap text-text-secondary ui-motion",
    props.class,
  ),
);
</script>

<template>
  <span :class="classes">
    <slot />
  </span>
</template>
