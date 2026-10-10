<script setup lang="ts">
import { computed } from "vue";
import { useSuspenseOpenRouterRankings } from "@/client/api/api-queries";
import { isPartialPayload, unwrapList } from "@/client/api/payload-normalize";
import NotFound from "@/client/components/feedback/not-found.vue";
import PartialNotice from "@/client/components/feedback/partial-notice.vue";
import DetailShell, { findModel } from "@/client/components/model-detail/detail-views.vue";
import OrContent from "@/client/components/model-detail/openrouter-detail.vue";
import type { OpenRouterRankEntry } from "@/shared/types";

const props = defineProps<{ decodedId: string }>();

const query = await useSuspenseOpenRouterRankings();
const data = computed(() => unwrapList<OpenRouterRankEntry>(query.data.value, "openRouterRankings"));
const partial = computed(() => isPartialPayload(query.data.value));
const model = computed(() => findModel(data.value, props.decodedId, "id"));
</script>

<template>
  <NotFound v-if="!model" />
  <DetailShell v-else source="or" :title="model.name">
    <PartialNotice v-if="partial" />
    <OrContent :model="model" />
  </DetailShell>
</template>
