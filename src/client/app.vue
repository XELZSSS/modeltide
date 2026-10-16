<script setup lang="ts">
import { computed, watch } from "vue";
import { useRoute } from "vue-router";
import { syncDocumentMeta, useTranslation } from "./i18n";
import { useDocumentMeta } from "./router/document-meta";
import AppShell from "./shell/app-shell.vue";
import SuspenseQuery from "./router/suspense-query.vue";

const { lang } = useTranslation();
const route = useRoute();
const routeKey = computed(() => String(route.name ?? "notFound"));

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
