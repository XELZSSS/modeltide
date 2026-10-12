<script setup lang="ts">
import { computed } from "vue";
import { useSuspenseOpenRouterRankingsState } from "@/client/api/api-queries";
import OpenRouterRankingsView from "./openrouter-rankings-view.vue";
import RankingTabShell from "./ranking-tab-shell.vue";

const state = await useSuspenseOpenRouterRankingsState();
const payload = computed(() => ({
  data: state.value.items,
  fetchedAt: new Date().toISOString(),
  partial: state.value.partial,
}));
</script>

<template>
  <RankingTabShell :state="state" domain="openRouterRankings">
    <OpenRouterRankingsView :data="payload" />
  </RankingTabShell>
</template>
