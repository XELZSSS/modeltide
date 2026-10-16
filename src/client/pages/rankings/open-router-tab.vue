<script setup lang="ts">
import { computed } from "vue";
import { useSuspenseOpenRouterRankings } from "@/client/api/hooks";
import TabStateShell from "@/client/components/tab-state-shell.vue";
import OpenRouterRankingsView from "./openrouter-rankings-view.vue";

const state = await useSuspenseOpenRouterRankings();
// The wrapper only exists because the view consumes a SourcePayload. fetchedAt
// must be the server's real fetch time — never a client clock reading — or any
// "updated X ago" copy would always claim the data is fresh.
const payload = computed(() => ({
  data: state.items.value,
  fetchedAt: state.fetchedAt.value ?? "",
  partial: state.partial.value,
}));
// TabStateShell reads plain values off its state prop, so unwrap the refs here.
const tabState = computed(() => ({
  items: state.items.value,
  partial: state.partial.value,
  malformed: state.malformed.value,
}));
</script>

<template>
  <TabStateShell :state="tabState" domain="openRouterRankings">
    <OpenRouterRankingsView :data="payload" />
  </TabStateShell>
</template>
