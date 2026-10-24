<script setup lang="ts">
import { computed } from "vue";
import { useSuspenseOpenRouterRankings } from "@/client/api/hooks";
import ModelMiss from "@/client/components/feedback/model-miss.vue";
import Notice from "@/client/components/feedback/notice.vue";
import PartialNotice from "@/client/components/feedback/partial-notice.vue";
import { useTranslation } from "@/client/i18n";
import { useSoftNotFound } from "@/client/router/document-meta";
import { isRetiredRankEntry } from "@/shared/config/time";
import DetailShell, { findModel } from "./detail-views.vue";
import OrContent from "./openrouter-detail.vue";

const props = defineProps<{ decodedId: string }>();

const { t } = useTranslation();

const state = await useSuspenseOpenRouterRankings();
const partial = computed(() => state.value.partial);
const model = computed(() => findModel(state.value.items, props.decodedId, "id"));
/**
 * The ranking leaves retired rows out (their rank no longer exists), but the row is still the model a reader followed a
 * link to: its last served snapshot is real data, so it is rendered with a notice instead of a "not found" page.
 */
const retired = computed(() => model.value !== undefined && isRetiredRankEntry(model.value.expiresAt));

useSoftNotFound(computed(() => !model.value && !partial.value));
</script>

<template>
  <ModelMiss v-if="!model" :partial="partial" />
  <DetailShell v-else source="or" :title="model.name">
    <Notice v-if="retired">{{ t("rankEntryRetired") }}</Notice>
    <PartialNotice v-if="partial" />
    <OrContent :model="model" />
  </DetailShell>
</template>
