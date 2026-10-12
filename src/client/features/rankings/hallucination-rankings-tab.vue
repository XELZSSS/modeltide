<script setup lang="ts">
import { computed } from "vue";
import { useHallucinationRankings, useSuspenseArtificialRankingsState } from "@/client/api/api-queries";
import EmptyState from "@/client/components/feedback/empty-state.vue";
import { useTranslation } from "@/client/i18n";
import HallucinationRankingsView from "./hallucination-view.vue";
import RankingTabShell from "./ranking-tab-shell.vue";
import { isHallucinationDataUnavailable } from "@/shared/utils/hallucination";

const state = await useSuspenseArtificialRankingsState();
const rankings = useHallucinationRankings(computed(() => state.value.items));

const { t } = useTranslation();
const unavailable = computed(() => isHallucinationDataUnavailable(state.value.items, rankings.value));
</script>

<template>
  <RankingTabShell :state="state" domain="artificialIndex">
    <EmptyState v-if="unavailable" variant="error" :message="t('rankingsUnavailable')" />
    <HallucinationRankingsView v-else :rankings="rankings" />
  </RankingTabShell>
</template>
