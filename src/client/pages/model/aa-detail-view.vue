<script setup lang="ts">
import { useSuspenseArtificialRankingsState } from "@/client/api/view-models";
import ModelMiss from "@/client/components/feedback/model-miss.vue";
import PartialNotice from "@/client/components/feedback/partial-notice.vue";
import DetailShell, { findModel } from "./detail-views.vue";
import AaContent from "./aa-detail.vue";
import { useModelLookup } from "./use-model-lookup";

const props = defineProps<{ decodedId: string }>();

const state = await useSuspenseArtificialRankingsState();
const { model, partial } = useModelLookup(
  () => findModel(state.value.items, props.decodedId, "id", "slug"),
  () => state.value.partial,
);
</script>

<template>
  <ModelMiss v-if="!model" :partial="partial" />
  <DetailShell v-else source="aa" :title="model.name">
    <PartialNotice v-if="partial" />
    <AaContent :model="model" />
  </DetailShell>
</template>
