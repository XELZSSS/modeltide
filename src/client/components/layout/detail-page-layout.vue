<script setup lang="ts">
import type { TranslationKey } from "@/shared/i18n";
import BackButton from "@/client/components/layout/back-button.vue";
import PageHeader from "@/client/components/layout/page-header.vue";

defineProps<{
  backLabelKey: TranslationKey;
  backTo: string;
  title: string;
  description?: string;
  compact?: boolean;
}>();
</script>

<template>
  <div class="flex flex-col gap-5 min-w-0">
    <BackButton :label-key="backLabelKey" :to="backTo" />
    <PageHeader :compact="compact" :title="title" :description="description" />
    <div class="flex flex-col gap-4 sm:gap-5"><slot /></div>
  </div>
</template>
