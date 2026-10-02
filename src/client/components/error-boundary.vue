<script setup lang="ts">
import { onErrorCaptured, onMounted, onUnmounted, ref } from "vue";
import { TriangleAlert } from "@lucide/vue";
import { useTranslation } from "@/client/i18n";
import EmptyState from "@/client/components/feedback/empty-state.vue";
import Button from "@/client/components/ui/button.vue";

const props = defineProps<{ reset?: () => void }>();

const { t } = useTranslation();

const error = ref<Error | null>(null);
const attempt = ref(0);
const online = ref(navigator.onLine !== false);

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
  console.error("[ErrorBoundary]", err);
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
  <div v-if="error" class="flex flex-col items-center gap-3">
    <EmptyState
      variant="error"
      :icon="TriangleAlert"
      :title="t('errorBoundaryTitle')"
      :message="error.message || t('errorBoundaryRetry')"
    />
    <p v-if="!online" class="ui-caption" role="status">{{ t("offlineRetry") }}</p>
    <Button variant="outline" size="sm" :disabled="!online" @click="retry">{{ t("errorBoundaryRetry") }}</Button>
  </div>
  <Suspense v-else :key="attempt">
    <slot />
    <template #fallback><slot name="fallback" /></template>
  </Suspense>
</template>
