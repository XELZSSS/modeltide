<script setup lang="ts">
/**
 * The Suspense fallback's dots, held back for one short delay.
 *
 * A warm suspend resolves inside a frame or two, so an immediate three-dot placeholder was mounted and thrown away
 * within a couple of frames — a flicker on every warm tab or route switch. Waiting first means a fast resolve shows
 * nothing at all. The caller still reserves the fallback's height, so the switch never changes the page's geometry,
 * and reusing the shell's refetch delay keeps the "don't flash a loader" rule to one number.
 */
import { onMounted, onUnmounted, ref } from "vue";
import LoadingDots from "@/client/components/ui/loading-dots.vue";
import { MOTION_FAST_MS } from "@/client/motion";

// `MOTION_FAST_MS` is one `fast` beat of the motion scale, and this placeholder is the app's only loader, so the whole
// "don't flash a loader" rule is one number. It sits between the two failure modes: it absorbs a warm resolve (a
// prefetched chunk plus a cached query lands within a frame or two), and it is short enough that the reserved plate never
// reads as stuck. Being exactly the panel cross-fade's length also means the loader appears once that fade is over.

const visible = ref(false);
let timer: ReturnType<typeof setTimeout> | null = null;

onMounted(() => {
  timer = setTimeout(() => {
    timer = null;
    visible.value = true;
  }, MOTION_FAST_MS);
});

// A resolve unmounts the fallback, and with it this timer: leaving it armed would flip `visible` on a dead component.
onUnmounted(() => {
  if (timer === null) return;
  clearTimeout(timer);
  timer = null;
});
</script>

<template>
  <LoadingDots v-if="visible" class="text-text-tertiary" />
</template>
