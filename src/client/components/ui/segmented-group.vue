<script setup lang="ts">
import { computed } from "vue";
import { cn } from "@/client/utils/cn";

const props = defineProps<{ class?: string }>();
// No divider rule under the strip: the active tab already carries its own accent underline, so a full-width border
// under the row only doubled that line. The 3px of vertical padding (cancelled by an equal negative margin) is there
// because the strip is an `overflow-x` scroller that clips at its padding box, and a tab's focus ring (`ring-2` +
// `ring-offset-1` = 3px) hangs outside the button: without it the ring's top and bottom segments were never painted.
const classes = computed(() => cn("inline-flex max-w-full items-center gap-5 py-[3px] -my-[3px]", props.class));
</script>

<template>
  <div :class="classes">
    <slot />
  </div>
</template>
