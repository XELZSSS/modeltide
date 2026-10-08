<script setup lang="ts">
import { useSuspenseArtificialRankingsState } from "@/client/api/api-queries";
import { assertPayloadShape } from "@/client/api/payload-normalize";
import TabStateShell from "@/client/components/data/tab-state-shell.vue";
import ArtificialAnalysisView from "./aa-view.vue";

const state = await useSuspenseArtificialRankingsState();
assertPayloadShape(state.value.malformed, "artificialIndex");
</script>

<template>
  <TabStateShell :state="state">
    <ArtificialAnalysisView :rankings="state.items" />
  </TabStateShell>
</template>
