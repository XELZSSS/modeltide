<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";
import { SOURCES } from "@/client/nav/sources";
import type { ModelSource } from "@/shared/types";
import NotFound from "@/client/components/not-found.vue";
import SuspenseQuery from "@/client/router/suspense-query.vue";
import OpenSourceDetail from "./open-source-detail.vue";
import HallucinationDetail from "./hallucination-detail.vue";
import AaDetailView from "./aa-detail-view.vue";
import OrDetailView from "./or-detail-view.vue";

function isModelSource(value: string): value is ModelSource {
  return Object.hasOwn(SOURCES, value);
}

const route = useRoute();

const rawId = computed(() => (typeof route.params.id === "string" ? route.params.id : ""));

const source = computed<ModelSource | null>(() => {
  const value = rawId.value.split("/")[0] ?? "";
  return isModelSource(value) ? value : null;
});

const decodedId = computed(() => {
  const at = rawId.value.indexOf("/");
  return at < 0 ? "" : rawId.value.slice(at + 1);
});
</script>

<template>
  <SuspenseQuery>
    <NotFound v-if="!source || !decodedId" />
    <AaDetailView v-else-if="source === 'aa'" :key="decodedId" :decoded-id="decodedId" />
    <OrDetailView v-else-if="source === 'or'" :key="decodedId" :decoded-id="decodedId" />
    <OpenSourceDetail v-else-if="source === 'os'" :key="decodedId" :decoded-id="decodedId" />
    <HallucinationDetail v-else :key="decodedId" :decoded-id="decodedId" />
  </SuspenseQuery>
</template>
