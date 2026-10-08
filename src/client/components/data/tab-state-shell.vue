<script setup lang="ts">
import PartialNotice from "@/client/components/feedback/partial-notice.vue";
import EmptyState from "@/client/components/feedback/empty-state.vue";
import { useTranslation } from "@/client/i18n";
import type { TranslationKey } from "@/shared/i18n";

interface TabState {
  items: readonly unknown[];
  partial: boolean;
}

const props = defineProps<{ state: TabState; emptyMessageKey?: TranslationKey }>();

const { t } = useTranslation();
</script>

<template>
  <PartialNotice v-if="props.state.partial" />
  <EmptyState v-if="props.state.items.length === 0" variant="plain" :message="t(props.emptyMessageKey ?? 'noRankingsData')" />
  <slot v-else />
</template>
