<script setup lang="ts">
import { computed } from "vue";
import { useSuspenseArtificialRankingsState } from "@/client/api/hooks";
import NotFound from "@/client/components/feedback/not-found.vue";
import { useSoftNotFound } from "@/client/router/document-meta";
import PartialNotice from "@/client/components/feedback/partial-notice.vue";
import DetailShell, { findModel } from "./detail-views.vue";
import AaContent from "./aa-detail.vue";

const props = defineProps<{ decodedId: string }>();

const state = await useSuspenseArtificialRankingsState();
const model = computed(() => findModel(state.value.items, props.decodedId, "id", "slug"));

useSoftNotFound(computed(() => !model.value));
</script>

<template>
  <NotFound v-if="!model" heading-key="modelNotFoundTitle" body-key="modelNotFound" :code="null" />
  <DetailShell v-else source="aa" :title="model.name">
    <PartialNotice v-if="state.partial" />
    <AaContent :model="model" />
  </DetailShell>
</template>
