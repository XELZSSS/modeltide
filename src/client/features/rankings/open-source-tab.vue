<script setup lang="ts">
import { useSuspenseOpenSourceModelsState } from "@/client/api/api-queries";
import { assertPayloadShape } from "@/client/api/payload-normalize";
import PartialNotice from "@/client/components/feedback/partial-notice.vue";
import OpenSourceRankingsView from "./open-source-view.vue";

const state = await useSuspenseOpenSourceModelsState();
assertPayloadShape(state.value.malformed, "openSourceModels");
</script>

<template>
  <PartialNotice v-if="state.partial" />
  <OpenSourceRankingsView :rankings="state.items" />
</template>
