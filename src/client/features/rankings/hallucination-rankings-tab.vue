<script setup lang="ts">
import { computed } from "vue";
import { useHallucinationRankings, useSuspenseArtificialRankingsState } from "@/client/api/api-queries";
import { assertPayloadShape } from "@/client/api/payload-normalize";
import EmptyState from "@/client/components/feedback/empty-state.vue";
import PartialNotice from "@/client/components/feedback/partial-notice.vue";
import { useTranslation } from "@/client/i18n";
import { loadableView } from "@/client/router/lazy-view";
import { isHallucinationDataUnavailable } from "@/client/utils/hallucination";

const HallucinationRankingsView = loadableView(() => import("./hallucination-view.vue"));

const state = await useSuspenseArtificialRankingsState();
const rankings = useHallucinationRankings(computed(() => state.value.items));
assertPayloadShape(state.value.malformed, "artificialIndex");

const { t } = useTranslation();
const unavailable = computed(() => isHallucinationDataUnavailable(state.value.items, rankings.value));
</script>

<template>
  <PartialNotice v-if="state.partial" />
  <EmptyState v-if="unavailable" variant="error" :message="t('rankingsUnavailable')" />
  <HallucinationRankingsView v-else :rankings="rankings" />
</template>
