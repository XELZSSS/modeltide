<script setup lang="ts">
import { onUnmounted, ref, watch } from "vue";
import { useIsFetching } from "@tanstack/vue-query";
import LoadingDots from "@/client/components/ui/loading-dots.vue";
import { PAGE_GUTTER, PAGE_WIDTH } from "@/client/nav/layout";

/**
 * The refetch indicator: a quiet three-dot mark for "the data you are looking at is being refreshed" — window focus, an
 * expired TTL, a partial-data poll, a retry. It counts only queries that already hold data, because a query without data
 * is a first load and belongs to the Suspense placeholder; that split keeps the two indicators mutually exclusive by
 * construction instead of by timing.
 *
 * Appearance is delayed, disappearance is not: a request that settles inside the delay never shows anything (no flash),
 * and one that does show the dots drops them the moment the counter returns to zero, so they can never sit on top of
 * content that has already been repainted.
 */
const SHOW_DELAY_MS = 150;

const refreshing = useIsFetching({
  predicate: (query) => query.state.data !== undefined && query.state.fetchStatus === "fetching",
});

const visible = ref(false);
let showTimer: ReturnType<typeof setTimeout> | null = null;

function cancelShow(): void {
  if (showTimer === null) return;
  clearTimeout(showTimer);
  showTimer = null;
}

watch(
  () => refreshing.value > 0,
  (active) => {
    if (!active) {
      cancelShow();
      visible.value = false;
      return;
    }
    if (visible.value || showTimer !== null) return;
    showTimer = setTimeout(() => {
      showTimer = null;
      visible.value = true;
    }, SHOW_DELAY_MS);
  },
);

onUnmounted(cancelShow);
</script>

<template>
  <!--
    Sticky and zero-height. It has to be a direct child of the scrollport: a sticky box can only travel inside its own
    containing block, so nesting it in the page column would have pinned it to that column's few pixels of height. The
    column classes live on the inner row instead, which keeps the dots on the same axis as the page.
  -->
  <Transition name="ui-loader">
    <div v-if="visible" class="pointer-events-none sticky top-0 z-30" :class="[PAGE_WIDTH, PAGE_GUTTER]">
      <div class="flex h-0 justify-center">
        <LoadingDots class="mt-2 text-text-tertiary" />
      </div>
    </div>
  </Transition>
</template>
