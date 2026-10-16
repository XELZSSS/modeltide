<script setup lang="ts">
import { useSuspenseOpenSourceModelsState } from "@/client/api/hooks";
import TabStateShell from "@/client/components/tab-state-shell.vue";
import OpenSourceRankingsView from "./open-source-view.vue";

const state = await useSuspenseOpenSourceModelsState();
</script>

<template>
  <TabStateShell :state="state" domain="openSourceModels">
    <OpenSourceRankingsView :rankings="state.items" />
  </TabStateShell>
</template>
