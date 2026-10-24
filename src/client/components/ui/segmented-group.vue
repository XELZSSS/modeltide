<script setup lang="ts">
/**
 * The strip a tab bar or segmented control sits in: a muted pill container (`bg-muted`, `rounded-lg`, 3px inset) that
 * the active item pops out of. It only owns the layout of that strip.
 */
import { computed } from "vue";
import { cn } from "@/client/utils/cn";

const props = defineProps<{ class?: string }>();
// No divider rule under the strip: the raised active pill already marks selection. The 3px padding is the inset the
// reference segmented control uses, and it is also what keeps a focused item's ring inside the scroller's clip box.
const classes = computed(() =>
  cn("inline-flex max-w-full items-center gap-0.5 rounded-lg bg-muted p-[3px]", props.class),
);
</script>

<template>
  <div :class="classes">
    <slot />
  </div>
</template>
