<script setup lang="ts">
import { useSuspenseCodingAgentRankings } from "@/client/api/view-models";
import TabStateShell from "@/client/components/navigation/tab-state-shell.vue";
import CodingAgentView from "./coding-agent-view.vue";

const state = await useSuspenseCodingAgentRankings();
</script>

<template>
  <TabStateShell :state="state" domain="codingAgentRankings">
    <CodingAgentView :rows="state.items" />
  </TabStateShell>
</template>
