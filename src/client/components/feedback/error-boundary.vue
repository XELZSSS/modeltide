<script setup lang="ts">
/**
 * Catches render and async errors from everything below it, reports them once, and offers a retry that remounts the
 * subtree through the `Suspense` key. The failure is shown as the kind of failure it is — `errorText` names it and
 * puts its source and statuses underneath — instead of one shared "something went wrong" for every cause. Retrying is
 * blocked while the browser reports itself offline, because the retry could only fail again and the notice already
 * says why.
 */
import { computed, onErrorCaptured, onMounted, onUnmounted, ref } from "vue";
import { TriangleAlert } from "@lucide/vue";
import { useTranslation } from "@/client/i18n";
import EmptyState from "@/client/components/feedback/empty-state.vue";
import Button from "@/client/components/ui/button.vue";
import { reportClientError } from "@/client/monitoring";
import PageContainer from "@/client/components/layout/page-container.vue";
import { errorText } from "@/client/api/present/error-text";

const props = defineProps<{ reset?: () => void }>();

const { t } = useTranslation();

const error = ref<Error | null>(null);
const attempt = ref(0);
const online = ref(navigator.onLine !== false);
const failure = computed(() => (error.value === null ? null : errorText(error.value, t)));

function syncOnline(): void {
  online.value = navigator.onLine !== false;
}

onMounted(() => {
  window.addEventListener("online", syncOnline);
  window.addEventListener("offline", syncOnline);
});

onUnmounted(() => {
  window.removeEventListener("online", syncOnline);
  window.removeEventListener("offline", syncOnline);
});

onErrorCaptured((err: unknown) => {
  reportClientError("ErrorBoundary", err);
  error.value = err instanceof Error ? err : new Error(String(err));
  return false;
});

function retry(): void {
  if (navigator.onLine === false) return;
  error.value = null;
  attempt.value += 1;
  props.reset?.();
}
</script>

<template>
  <PageContainer v-if="failure" class="flex flex-col items-center gap-3">
    <EmptyState
      variant="error"
      :icon="TriangleAlert"
      :title="failure.title"
      :message="failure.message"
      :details="failure.details"
    />
    <p v-if="!online" class="ui-caption" role="status">{{ t("offlineRetry") }}</p>
    <Button variant="outline" size="sm" :disabled="!online" @click="retry">{{ t("errorBoundaryRetry") }}</Button>
  </PageContainer>
  <Suspense v-else :key="attempt">
    <slot />
    <template #fallback><slot name="fallback" /></template>
  </Suspense>
</template>
