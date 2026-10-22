<script setup lang="ts">
import { computed } from "vue";
import { useSuspenseOpenRouterRankings } from "@/client/api/hooks";
import NotFound from "@/client/components/feedback/not-found.vue";
import { useSoftNotFound } from "@/client/router/document-meta";
import PartialNotice from "@/client/components/feedback/partial-notice.vue";
import DetailShell, { findModel } from "./detail-views.vue";
import OrContent from "./openrouter-detail.vue";

const props = defineProps<{ decodedId: string }>();

const state = await useSuspenseOpenRouterRankings();
const partial = computed(() => state.value.partial);
const model = computed(() => findModel(state.value.items, props.decodedId, "id"));

useSoftNotFound(computed(() => !model.value));
</script>

<template>
  <NotFound v-if="!model" heading-key="modelNotFoundTitle" body-key="modelNotFound" :code="null" />
  <DetailShell v-else source="or" :title="model.name">
    <PartialNotice v-if="partial" />
    <OrContent :model="model" />
  </DetailShell>
</template>
