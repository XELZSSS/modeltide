<script setup lang="ts">
import { useSuspenseOpenRouterRankings } from "@/client/api/api-queries";
import OpenRouterRankingsView from "./openrouter-rankings-view.vue";

const query = await useSuspenseOpenRouterRankings();
const data = query.data;
</script>

<template>
  <OpenRouterRankingsView :data="data" />
</template>
