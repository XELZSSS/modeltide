<script setup lang="ts">
import { computed } from "vue";
import { useHallucinationRankings, useSuspenseArtificialRankingsState } from "@/client/api/hooks";
import TabStateShell from "@/client/components/tab-state-shell.vue";
import EmptyState from "@/client/components/empty-state.vue";
import { useTranslation } from "@/client/i18n";
import HallucinationRankingsView from "./hallucination-view.vue";
import { isHallucinationDataUnavailable } from "@/shared/utils/hallucination";

const state = await useSuspenseArtificialRankingsState();
const rankings = useHallucinationRankings(computed(() => state.value.items));

const { t } = useTranslation();
const unavailable = computed(() => isHallucinationDataUnavailable(state.value.items, rankings.value));
</script>

<template>
  <TabStateShell :state="state" domain="artificialIndex">
    <EmptyState v-if="unavailable" variant="error" :message="t('rankingsUnavailable')" />
    <HallucinationRankingsView v-else :rankings="rankings" />
  </TabStateShell>
</template>
