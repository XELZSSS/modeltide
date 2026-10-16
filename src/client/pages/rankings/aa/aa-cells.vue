<script setup lang="ts">
import ModelDetailContent from "@/client/pages/model/aa-detail.vue";
import type { ArtificialAnalysisModel } from "@/shared/types";

defineProps<{ model: ArtificialAnalysisModel }>();
</script>

<template>
  <ModelDetailContent :model="model" :show-benchmarks="false" />
</template>
