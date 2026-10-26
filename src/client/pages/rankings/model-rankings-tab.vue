<script setup lang="ts">
import { useSuspenseArtificialRankingsState } from "@/client/api/view-models";
import TabStateShell from "@/client/components/navigation/tab-state-shell.vue";
import ArtificialAnalysisView from "./aa-view.vue";

const state = await useSuspenseArtificialRankingsState();
</script>

<template>
  <TabStateShell :state="state" domain="artificialIndex">
    <ArtificialAnalysisView :rankings="state.items" :partial="state.partial" />
  </TabStateShell>
</template>
