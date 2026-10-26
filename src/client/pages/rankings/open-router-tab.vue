<script setup lang="ts">
import { computed } from "vue";
import { useSuspenseOpenRouterRankings } from "@/client/api/view-models";
import TabStateShell from "@/client/components/navigation/tab-state-shell.vue";
import OpenRouterRankingsView from "./openrouter-rankings-view.vue";
import { servedRankEntries } from "@/shared/config/time";

const state = await useSuspenseOpenRouterRankings();
// A retired entry no longer holds a rank, and the array order *is* the ranking, so leaving one in would push every row
// below it down a place. The model itself is not hidden: a direct link still resolves it (see `or-detail-view.vue`).
// Spread, not a hand-written trio: `TabStateShell` reads `partial` and `malformed` as well as `items`, and a literal
// that named only the fields this tab cares about would drop the degraded-payload signal on the floor.
const tabState = computed(() => ({ ...state.value, items: servedRankEntries(state.value.items) }));
</script>

<template>
  <TabStateShell :state="tabState" domain="openRouterRankings">
    <OpenRouterRankingsView :rows="tabState.items" />
  </TabStateShell>
</template>
