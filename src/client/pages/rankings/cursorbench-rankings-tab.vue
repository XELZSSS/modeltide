<script setup lang="ts">
import { useSuspenseCursorBenchState } from "@/client/api/view-models";
import TabStateShell from "@/client/components/navigation/tab-state-shell.vue";
import CursorBenchView from "./cursorbench-view.vue";

const state = await useSuspenseCursorBenchState();
</script>

<template>
  <TabStateShell :state="state" domain="cursorBench">
    <CursorBenchView :rows="state.items" />
  </TabStateShell>
</template>
