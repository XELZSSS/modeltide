<script setup lang="ts">
import { computed } from "vue";
import { useSuspenseOpenRouterRankings } from "@/client/api/hooks";
import TabStateShell from "@/client/components/tab-state-shell.vue";
import OpenRouterRankingsView from "./openrouter-rankings-view.vue";

const state = await useSuspenseOpenRouterRankings();
// TabStateShell reads plain values off its state prop, so unwrap the refs here.
const tabState = computed(() => ({
  items: state.items.value,
  partial: state.partial.value,
  malformed: state.malformed.value,
}));
</script>

<template>
  <TabStateShell :state="tabState" domain="openRouterRankings">
    <OpenRouterRankingsView :rows="tabState.items" />
  </TabStateShell>
</template>
