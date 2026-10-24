<script setup lang="ts">
import { contractSkew } from "@/client/api/api-client";
import { useTranslation } from "@/client/i18n";
import Notice from "@/client/components/feedback/notice.vue";

const { t } = useTranslation();

// A served contract version that differs from this build means the bundle is stale (normally a service-worker copy).
// The notice already told the reader to reload, so hand them the action instead of leaving it manual.
function reload(): void {
  window.location.reload();
}
</script>

<template>
  <Notice v-if="contractSkew">
    <span>{{ t("contractSkewNotice") }}</span>
    <button
      type="button"
      class="ml-1 inline-flex min-h-9 shrink-0 items-center px-1 font-medium text-text-primary underline-offset-2 ui-motion focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:outline-none hoverable:hover:underline"
      @click="reload"
    >
      {{ t("reloadAction") }}
    </button>
  </Notice>
</template>
