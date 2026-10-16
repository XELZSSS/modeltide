<script setup lang="ts">
import { useQueryClient } from "@tanstack/vue-query";
import ErrorBoundary from "@/client/components/error-boundary.vue";
import PageContainer from "@/client/components/page-container.vue";
import Spinner from "@/client/components/spinner.vue";

const queryClient = useQueryClient();

function reset(): void {
  void queryClient.resetQueries({ type: "active" });
}
</script>

<template>
  <ErrorBoundary :reset="reset">
    <slot />
    <template #fallback>
      <PageContainer>
        <slot name="fallback"><Spinner /></slot>
      </PageContainer>
    </template>
  </ErrorBoundary>
</template>
