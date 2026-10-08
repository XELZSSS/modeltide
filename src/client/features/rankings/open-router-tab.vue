<script setup lang="ts">
import { computed } from "vue";
import { useSuspenseOpenRouterRankingsState } from "@/client/api/api-queries";
import { assertPayloadShape } from "@/client/api/payload-normalize";
import TabStateShell from "@/client/components/data/tab-state-shell.vue";
import OpenRouterRankingsView from "./openrouter-rankings-view.vue";

const state = await useSuspenseOpenRouterRankingsState();
assertPayloadShape(state.value.malformed, "openRouterRankings");
const payload = computed(() => ({
  data: state.value.items,
  fetchedAt: new Date().toISOString(),
  partial: state.value.partial,
}));
</script>

<template>
  <TabStateShell :state="state">
    <OpenRouterRankingsView :data="payload" />
  </TabStateShell>
</template>
