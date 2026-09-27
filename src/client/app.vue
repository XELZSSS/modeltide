<script setup lang="ts">
import { computed, watch } from "vue";
import { useRoute } from "vue-router";
import { syncDocumentMeta, useTranslation } from "@/client/i18n";
import { useDocumentMeta } from "@/client/router/document-meta";
import AppShell from "@/client/components/layout/app-shell.vue";
import SuspenseQuery from "@/client/router/suspense-query.vue";

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
