<script setup lang="ts">
import { useTranslation } from "@/client/i18n";
import { MODEL_SOURCES } from "@/client/config/nav-config";
import { loadableView } from "@/client/router/lazy-view";
import ComparePageLayout from "./compare-layout.vue";

const CompareRadarChart = loadableView(() => import("./compare-radar-chart.vue"));

const { t } = useTranslation();
</script>

<template>
  <ComparePageLayout :back-to="MODEL_SOURCES.aa.backTo" :title="t('modelComparison')">
    <template #default="{ models }">
      <CompareRadarChart :models="models" />
    </template>
  </ComparePageLayout>
</template>
