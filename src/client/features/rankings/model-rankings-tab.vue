<script setup lang="ts">
import { useSuspenseArtificialRankingsState } from "@/client/api/api-queries";
import ArtificialAnalysisView from "./aa-view.vue";
import RankingTabShell from "./ranking-tab-shell.vue";

const state = await useSuspenseArtificialRankingsState();
</script>

<template>
  <RankingTabShell :state="state" domain="artificialIndex">
    <ArtificialAnalysisView :rankings="state.items" />
  </RankingTabShell>
</template>
