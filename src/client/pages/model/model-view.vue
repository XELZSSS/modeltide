<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";
import { SOURCES } from "@/client/nav/sources";
import type { ModelSource } from "@/shared/types";
import { MAX_MODEL_ID_CHARS } from "@/shared/config/api";
import NotFound from "@/client/components/feedback/not-found.vue";
import { useSoftNotFound } from "@/client/router/document-meta";
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
  const id = at < 0 ? "" : rawId.value.slice(at + 1);
  // The API answers 400 for an id past MAX_MODEL_ID_CHARS and the page cannot recover from that, so a URL over the
  // limit takes the missing-model path instead of becoming a dead error boundary.
  return id.length > MAX_MODEL_ID_CHARS ? "" : id;
});

useSoftNotFound(computed(() => !source.value || !decodedId.value));
</script>

<template>
  <SuspenseQuery>
    <NotFound v-if="!source || !decodedId" heading-key="modelNotFoundTitle" body-key="modelNotFound" :code="null" />
    <AaDetailView v-else-if="source === 'aa'" :key="decodedId" :decoded-id="decodedId" />
    <OrDetailView v-else-if="source === 'or'" :key="decodedId" :decoded-id="decodedId" />
    <OpenSourceDetail v-else-if="source === 'os'" :key="decodedId" :decoded-id="decodedId" />
    <HallucinationDetail v-else :key="decodedId" :decoded-id="decodedId" />
  </SuspenseQuery>
</template>
