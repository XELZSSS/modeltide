<script setup lang="ts">
import { useSuspenseDecisionIndexState } from "@/client/api/view-models";
import TabStateShell from "@/client/components/navigation/tab-state-shell.vue";
import DecisionRankingsView from "./decision-view.vue";

const state = await useSuspenseDecisionIndexState();
</script>

<template>
  <TabStateShell :state="state" domain="decisionIndex">
    <DecisionRankingsView :rankings="state.items" />
  </TabStateShell>
</template>
