<script setup lang="ts">
import { assertPayloadShape } from "@/client/api/payload-normalize";
import PartialNotice from "./partial-notice.vue";
import EmptyState from "./empty-state.vue";
import { useTranslation } from "@/client/i18n";
import type { ApiDomain } from "@/shared/config/api";
import type { TranslationKey } from "@/shared/i18n";

interface TabState {
  items: readonly unknown[];
  partial: boolean;
  /** Set by unwrapListPartial when the payload could not be parsed. */
  malformed?: boolean;
}

const props = defineProps<{
  state: TabState;
  /** Domain label used in the error raised for a malformed payload. */
  domain?: ApiDomain;
  emptyMessageKey?: TranslationKey;
}>();

// A malformed payload escalates the tab to the error boundary instead of
// rendering an empty tab.
assertPayloadShape(props.state.malformed ?? false, props.domain ?? "");

const { t } = useTranslation();
</script>

<template>
  <PartialNotice v-if="props.state.partial" />
  <EmptyState
    v-if="props.state.items.length === 0"
    variant="plain"
    :message="t(props.emptyMessageKey ?? 'noRankingsData')"
  />
  <slot v-else />
</template>
