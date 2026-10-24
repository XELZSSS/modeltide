<script setup lang="ts">
import { computed } from "vue";
import { useSuspenseOpenRouterRankings } from "@/client/api/hooks";
import TabStateShell from "@/client/components/navigation/tab-state-shell.vue";
import OpenRouterRankingsView from "./openrouter-rankings-view.vue";
import { servedRankEntries } from "@/shared/config/time";

const state = await useSuspenseOpenRouterRankings();
// A retired entry no longer holds a rank, and the array order *is* the ranking, so leaving one in would push every row
// below it down a place. The model itself is not hidden: a direct link still resolves it (see `or-detail-view.vue`).
const tabState = computed(() => ({
  items: servedRankEntries(state.value.items),
  partial: state.value.partial,
  malformed: state.value.malformed,
}));
</script>

<template>
  <TabStateShell :state="tabState" domain="openRouterRankings">
    <OpenRouterRankingsView :rows="tabState.items" />
  </TabStateShell>
</template>
