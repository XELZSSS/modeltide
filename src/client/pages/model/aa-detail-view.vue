<script setup lang="ts">
import { computed } from "vue";
import { useSuspenseArtificialRankingsState } from "@/client/api/hooks";
import ModelMiss from "@/client/components/feedback/model-miss.vue";
import { useSoftNotFound } from "@/client/router/document-meta";
import PartialNotice from "@/client/components/feedback/partial-notice.vue";
import DetailShell, { findModel } from "./detail-views.vue";
import AaContent from "./aa-detail.vue";

const props = defineProps<{ decodedId: string }>();

const state = await useSuspenseArtificialRankingsState();
const model = computed(() => findModel(state.value.items, props.decodedId, "id", "slug"));

// A `partial` payload can be missing the row of a model that exists — that is what `ModelMiss` says for the body — so
// only a complete payload may turn the title and the robots tag into "not found".
useSoftNotFound(computed(() => !model.value && !state.value.partial));
</script>

<template>
  <ModelMiss v-if="!model" :partial="state.partial" />
  <DetailShell v-else source="aa" :title="model.name">
    <PartialNotice v-if="state.partial" />
    <AaContent :model="model" />
  </DetailShell>
</template>
