<script setup lang="ts">
import { computed, watch } from "vue";
import { useRoute } from "vue-router";
import { useTranslation } from "./i18n";
import { syncDocumentMeta, useDocumentMeta } from "./router/document-meta";
import AppShell from "./shell/app-shell.vue";
import SuspenseQuery from "./router/suspense-query.vue";

const { lang } = useTranslation();
const route = useRoute();
const routeKey = computed(() => {
  const name = String(route.name ?? "notFound");
  const id = typeof route.params.id === "string" ? route.params.id : "";
  return id ? `${name}:${id}` : name;
});

useDocumentMeta();

watch(lang, (value) => syncDocumentMeta(value), { immediate: true });
</script>

<template>
  <AppShell>
    <SuspenseQuery :key="routeKey">
      <RouterView />
    </SuspenseQuery>
  </AppShell>
</template>
