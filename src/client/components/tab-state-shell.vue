<script setup lang="ts">
import { watch } from "vue";
import { assertPayloadShape } from "@/client/api/payload-normalize";
import PartialNotice from "./partial-notice.vue";
import EmptyState from "./empty-state.vue";
import { useTranslation } from "@/client/i18n";
import type { ApiDomain } from "@/shared/config/api";

interface TabState {
  items: readonly unknown[];
  partial: boolean;
  malformed: boolean;
}

const props = defineProps<{
  state: TabState;
  domain: ApiDomain;
}>();

// Watched, not read once at setup: a payload that only turns malformed after mount must still raise.
watch(
  () => props.state.malformed,
  (malformed) => assertPayloadShape(malformed, props.domain),
  { immediate: true },
);

const { t } = useTranslation();
</script>

<template>
  <PartialNotice v-if="props.state.partial" />
  <EmptyState v-if="props.state.items.length === 0" variant="plain" :message="t('noRankingsData')" />
  <slot v-else />
</template>
