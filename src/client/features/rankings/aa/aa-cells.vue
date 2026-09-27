<script setup lang="ts">
import ModelDetailContent from "@/client/features/models/model-details/aa-detail.vue";
import type { ArtificialAnalysisModel } from "@/shared/types";

defineProps<{ model: ArtificialAnalysisModel }>();
</script>

<template>
  <div class="p-4 sm:p-5">
    <ModelDetailContent :model="model" :show-benchmarks="false" />
  </div>
</template>
