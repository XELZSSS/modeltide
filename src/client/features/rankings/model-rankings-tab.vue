<script setup lang="ts">
import { useSuspenseArtificialRankingsState } from "@/client/api/api-queries";
import { assertPayloadShape } from "@/client/api/payload-normalize";
import PartialNotice from "@/client/components/feedback/partial-notice.vue";
import ArtificialAnalysisView from "./aa-view.vue";

const state = await useSuspenseArtificialRankingsState();
assertPayloadShape(state.value.malformed, "artificialIndex");
</script>

<template>
  <PartialNotice v-if="state.partial" />
  <ArtificialAnalysisView :rankings="state.items" />
</template>
