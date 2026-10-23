<script setup lang="ts">
import { useQueryClient } from "@tanstack/vue-query";
import ErrorBoundary from "@/client/components/feedback/error-boundary.vue";
import LoadingDots from "@/client/components/ui/loading-dots.vue";

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
    grid), so the page header and tabs stay put and the plate does not jump. A refetch is a different case — the data is
    already on screen — and is reported by the shell's fetch indicator instead, so the two never show at once.
  -->
  <ErrorBoundary :reset="reset">
    <slot />
    <template #fallback>
      <div class="flex min-h-[50vh] items-center justify-center">
        <LoadingDots class="text-text-tertiary" />
      </div>
    </template>
  </ErrorBoundary>
</template>
