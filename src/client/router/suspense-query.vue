<script setup lang="ts">
import { useQueryClient } from "@tanstack/vue-query";
import ErrorBoundary from "@/client/components/error-boundary.vue";
import ContractSkewNotice from "@/client/components/feedback/contract-skew-notice.vue";
import Spinner from "@/client/components/feedback/spinner.vue";
import { resetLoadableViews } from "@/client/router/lazy-view";

const queryClient = useQueryClient();

function reset(): void {
  resetLoadableViews();
  void queryClient.resetQueries({ type: "active" });
}
</script>

<template>
  <ContractSkewNotice />
  <ErrorBoundary :reset="reset">
    <slot />
    <template #fallback>
      <slot name="fallback"><Spinner /></slot>
    </template>
  </ErrorBoundary>
</template>
