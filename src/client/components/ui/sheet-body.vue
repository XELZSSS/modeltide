<script setup lang="ts">
/**
 * The scrolling content area of a sheet: capped to 70vh so the body scrolls alone. Every child keeps the box's own
 * padding — no negative margins — so nothing can be pulled out from under its neighbours.
 *
 * The scrollbar is hidden app-wide, so the bottom edge carries a fade while more content is still hidden below it: on
 * touch that is the only cue that the list continues, and it disappears as soon as the last row is in view.
 */
import { ref } from "vue";
import { cn } from "@/client/utils/cn";
import { useOverflowShadow } from "@/client/hooks/use-overflow-shadow";

const props = defineProps<{ class?: string }>();

const bodyRef = ref<HTMLElement | null>(null);
const { moreBelow, measure } = useOverflowShadow(bodyRef);
</script>

<template>
  <div class="relative">
    <div
      ref="bodyRef"
      :class="cn('flex max-h-[70vh] flex-col gap-5 overflow-y-auto p-5', props.class)"
      @scroll.passive="measure"
    >
      <slot />
    </div>
    <div
      v-if="moreBelow"
      aria-hidden="true"
      class="pointer-events-none absolute inset-x-0 bottom-0 h-8 rounded-b-none bg-linear-to-t from-popover to-transparent md:rounded-b-xl"
    />
  </div>
</template>
