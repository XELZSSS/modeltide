<script setup lang="ts">
import StatCard from "@/client/components/ui/stat-card.vue";
import StatGrid from "@/client/components/ui/stat-grid.vue";
import type { HomeKpi } from "./use-home-stats";

defineProps<{ kpis: HomeKpi[] }>();
</script>

<template>
  <StatGrid :columns="4">
    <StatCard v-for="kpi in kpis" :key="kpi.id" :icon="kpi.Icon" :label="kpi.label">{{ kpi.value }}</StatCard>
  </StatGrid>
</template>
