<script setup lang="ts">
import { useSuspenseOpenSourceModelsState } from "@/client/api/api-queries";
import { assertPayloadShape } from "@/client/api/payload-normalize";
import TabStateShell from "@/client/components/data/tab-state-shell.vue";
import OpenSourceRankingsView from "./open-source-view.vue";

const state = await useSuspenseOpenSourceModelsState();
assertPayloadShape(state.value.malformed, "openSourceModels");
</script>

<template>
  <TabStateShell :state="state">
    <OpenSourceRankingsView :rankings="state.items" />
  </TabStateShell>
</template>
