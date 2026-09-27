<script setup lang="ts">
import { useSuspenseOpenRouterRankings } from "@/client/api/api-queries";
import { loadableView } from "@/client/router/lazy-view";

const OpenRouterRankingsView = loadableView(() => import("./openrouter-rankings-view.vue"));

const query = await useSuspenseOpenRouterRankings();
const data = query.data;
</script>

<template>
  <OpenRouterRankingsView :data="data" />
</template>
