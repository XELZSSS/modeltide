<script setup lang="ts">
import { computed } from "vue";
import { useSuspenseOpenRouterRankingsState } from "@/client/api/hooks";
import TabStateShell from "@/client/components/tab-state-shell.vue";
import OpenRouterRankingsView from "./openrouter-rankings-view.vue";

const state = await useSuspenseOpenRouterRankingsState();
const payload = computed(() => ({
  data: state.value.items,
  fetchedAt: new Date().toISOString(),
  partial: state.value.partial,
}));
</script>

<template>
  <TabStateShell :state="state" domain="openRouterRankings">
    <OpenRouterRankingsView :data="payload" />
  </TabStateShell>
</template>
