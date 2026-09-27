<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";
import { SOURCE_IDS } from "@/shared/config";
import type { SourceId } from "@/shared/types";
import NotFound from "@/client/components/feedback/not-found.vue";
import SourceDetail from "@/client/features/status/source-detail.vue";

const route = useRoute();

const id = computed<SourceId | null>(() => {
  const raw = route.params.source;
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value != null && (SOURCE_IDS as readonly string[]).includes(value) ? (value as SourceId) : null;
});
</script>

<template>
  <NotFound v-if="id === null" />
  <SourceDetail v-else :key="id" :id="id" />
</template>
