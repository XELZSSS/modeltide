<script setup lang="ts">
import { computed } from "vue";
import { useHallucinationRankings, useSuspenseArtificialRankingsState } from "@/client/api/api-queries";
import { assertPayloadShape } from "@/client/api/payload-normalize";
import EmptyState from "@/client/components/feedback/empty-state.vue";
import TabStateShell from "@/client/components/data/tab-state-shell.vue";
import { useTranslation } from "@/client/i18n";
import HallucinationRankingsView from "./hallucination-view.vue";
import { isHallucinationDataUnavailable } from "@/shared/utils/hallucination";

const state = await useSuspenseArtificialRankingsState();
const rankings = useHallucinationRankings(computed(() => state.value.items));
assertPayloadShape(state.value.malformed, "artificialIndex");

const { t } = useTranslation();
const unavailable = computed(() => isHallucinationDataUnavailable(state.value.items, rankings.value));
</script>

<template>
  <TabStateShell :state="state">
    <EmptyState v-if="unavailable" variant="error" :message="t('rankingsUnavailable')" />
    <HallucinationRankingsView v-else :rankings="rankings" />
  </TabStateShell>
</template>
