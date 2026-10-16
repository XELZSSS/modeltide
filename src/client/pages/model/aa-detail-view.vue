<script setup lang="ts">
import { computed } from "vue";
import { useSuspenseArtificialRankingsState } from "@/client/api/hooks";
import NotFound from "@/client/components/not-found.vue";
import PartialNotice from "@/client/components/partial-notice.vue";
import DetailShell, { findModel } from "./detail-views.vue";
import AaContent from "./aa-detail.vue";

const props = defineProps<{ decodedId: string }>();

const state = await useSuspenseArtificialRankingsState();
const model = computed(() => findModel(state.value.items, props.decodedId, "id", "slug"));
</script>

<template>
  <NotFound v-if="!model" />
  <DetailShell v-else source="aa" :title="model.name">
    <PartialNotice v-if="state.partial" />
    <AaContent :model="model" />
  </DetailShell>
</template>
