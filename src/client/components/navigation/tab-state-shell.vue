<script setup lang="ts">
/**
 * The gate every tab body passes through: a partial notice, an empty state when the query returned nothing, and the
 * slot when there is data. A malformed payload is raised to the nearest ErrorBoundary instead of being rendered as an
 * empty list — the tab is wrapped in one.
 */
import { useMalformedGuard } from "@/client/hooks/use-malformed-guard";
import PartialNotice from "@/client/components/feedback/partial-notice.vue";
import EmptyState from "@/client/components/feedback/empty-state.vue";
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

useMalformedGuard(
  () => props.state.malformed,
  () => props.domain,
);

const { t } = useTranslation();

// Only the model rankings say "no rankings data"; every other tab says "no data".
</script>

<template>
  <PartialNotice v-if="props.state.partial" />
  <!-- The slot belongs to the empty check, not to the partial notice: a degraded payload that still has rows must render
       them, and both `v-if`s above can be true at once (partial + no rows), which is the case that shows the notice
       above the empty state instead of the empty state alone. -->
  <template v-if="props.state.items.length === 0">
    <EmptyState
      variant="plain"
      class="min-h-[50vh]"
      :message="t(props.domain === 'artificialIndex' ? 'noRankingsData' : 'noData')"
    />
  </template>
  <slot v-else />
</template>
