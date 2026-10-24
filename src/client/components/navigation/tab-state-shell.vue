<script setup lang="ts">
/**
 * The gate every tab body passes through: a partial notice, an empty state when the query returned nothing, and the
 * slot when there is data. A malformed payload is raised to the nearest ErrorBoundary instead of being rendered as an
 * empty list — the tab is wrapped in one.
 */
import { watch } from "vue";
import { assertPayloadShape } from "@/client/api/payload-normalize";
import PartialNotice from "@/client/components/feedback/partial-notice.vue";
import EmptyState from "@/client/components/feedback/empty-state.vue";
import { useTranslation } from "@/client/i18n";
import type { TranslationKey } from "@/shared/i18n";
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

watch(
  () => props.state.malformed,
  (malformed) => assertPayloadShape(malformed, props.domain),
  { immediate: true },
);

const { t } = useTranslation();

// Every tab used to say "no rankings data", including the ones that are not model rankings. The wording follows the
// domain the tab reads.
const EMPTY_MESSAGE: Record<ApiDomain, TranslationKey> = {
  artificialIndex: "noRankingsData",
  openRouterRankings: "noData",
  openSourceModels: "noData",
  closedReleases: "noData",
  news: "noData",
  homeDashboard: "noData",
};
</script>

<template>
  <PartialNotice v-if="props.state.partial" />
  <EmptyState v-if="props.state.items.length === 0" variant="plain" :message="t(EMPTY_MESSAGE[props.domain])" />
  <slot v-else />
</template>
