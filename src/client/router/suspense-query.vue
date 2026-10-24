<script setup lang="ts">
import { useQueryClient } from "@tanstack/vue-query";
import ErrorBoundary from "@/client/components/feedback/error-boundary.vue";
import DelayedDots from "@/client/components/feedback/delayed-dots.vue";

const queryClient = useQueryClient();

function reset(): void {
  void queryClient.resetQueries({ type: "active" });
}
</script>

<template>
  <!--
    The cold-load placeholder, and the only loader a first load ever shows. It lives *inside* the boundary, so the dots
    exist only while the awaiting setup is still unresolved: Vue swaps them for the content in the same commit, which is
    the one mechanism that can neither be left behind nor overlap data that has already arrived.

    Every page scopes this boundary to the region that will be filled (the tab panel, the release list, the dashboard
    grid), so the page header and tabs stay put and the plate does not jump. The dots themselves are held back for a
    short delay (see `DelayedDots`): a warm switch resolves before they would appear, so it shows nothing rather than a
    loader that the next frame throws away, while the reserved height keeps the geometry identical either way. This is the
    app's only loading state: a background refetch of data that is already on screen stays silent, and a degraded payload
    keeps its own `PartialNotice` rather than growing a second indicator.
  -->
  <ErrorBoundary :reset="reset">
    <slot />
    <template #fallback>
      <div class="flex min-h-[50vh] items-center justify-center">
        <DelayedDots />
      </div>
    </template>
  </ErrorBoundary>
</template>
