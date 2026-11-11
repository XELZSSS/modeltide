<script setup lang="ts">
import { useQueryClient } from "@tanstack/vue-query";
import ErrorBoundary from "@/client/components/feedback/error-boundary.vue";
import DelayedDots from "@/client/components/feedback/delayed-dots.vue";

const queryClient = useQueryClient();

function reset(): void {
  // Only what actually failed: `resetQueries({ type: "active" })` also dropped healthy caches, so retrying one broken
  // panel blanked the search lists and any other live data instead of retrying the failing route.
  void queryClient.resetQueries({ predicate: (query) => query.state.status === "error" });
}
</script>

<template>
  <!--
    The cold-load placeholder, and the only loader a first load ever shows: it lives inside the boundary, so the dots
    exist only while the awaiting setup is unresolved and Vue swaps them for the content in the same commit. Pages scope
    the boundary to the region that will be filled, and `DelayedDots` holds the dots back so a warm switch shows nothing
    rather than a loader the next frame throws away.
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
