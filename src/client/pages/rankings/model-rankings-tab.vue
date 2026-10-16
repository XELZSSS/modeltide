<script setup lang="ts">
import { useSuspenseArtificialRankingsState } from "@/client/api/hooks";
import TabStateShell from "@/client/components/tab-state-shell.vue";
import ArtificialAnalysisView from "./aa-view.vue";

const state = await useSuspenseArtificialRankingsState();
</script>

<template>
  <TabStateShell :state="state" domain="artificialIndex">
    <ArtificialAnalysisView :rankings="state.items" />
  </TabStateShell>
</template>
