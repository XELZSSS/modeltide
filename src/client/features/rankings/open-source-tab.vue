<script setup lang="ts">
import { useSuspenseOpenSourceModelsState } from "@/client/api/api-queries";
import OpenSourceRankingsView from "./open-source-view.vue";
import RankingTabShell from "./ranking-tab-shell.vue";

const state = await useSuspenseOpenSourceModelsState();
</script>

<template>
  <RankingTabShell :state="state" domain="openSourceModels">
    <OpenSourceRankingsView :rankings="state.items" />
  </RankingTabShell>
</template>
