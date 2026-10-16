<script setup lang="ts">
import { computed } from "vue";
import { useSuspenseOpenRouterRankings } from "@/client/api/hooks";
import NotFound from "@/client/components/not-found.vue";
import PartialNotice from "@/client/components/partial-notice.vue";
import DetailShell, { findModel } from "./detail-views.vue";
import OrContent from "./openrouter-detail.vue";

const props = defineProps<{ decodedId: string }>();

const state = await useSuspenseOpenRouterRankings();
const partial = computed(() => state.partial.value);
const model = computed(() => findModel(state.items.value, props.decodedId, "id"));
</script>

<template>
  <NotFound v-if="!model" />
  <DetailShell v-else source="or" :title="model.name">
    <PartialNotice v-if="partial" />
    <OrContent :model="model" />
  </DetailShell>
</template>
