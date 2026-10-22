<script setup lang="ts">
import { computed } from "vue";
import { useSuspenseOpenRouterRankings } from "@/client/api/hooks";
import TabStateShell from "@/client/components/navigation/tab-state-shell.vue";
import OpenRouterRankingsView from "./openrouter-rankings-view.vue";

const state = await useSuspenseOpenRouterRankings();
const tabState = computed(() => ({
  items: state.value.items,
  partial: state.value.partial,
  malformed: state.value.malformed,
}));
</script>

<template>
  <TabStateShell :state="tabState" domain="openRouterRankings">
    <OpenRouterRankingsView :rows="tabState.items" />
  </TabStateShell>
</template>
