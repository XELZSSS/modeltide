<script setup lang="ts">
import type { TranslationKey } from "@/shared/i18n";
import BackButton from "@/client/components/layout/back-button.vue";
import PageContainer from "@/client/components/layout/page-container.vue";
import PageHeader from "@/client/components/layout/page-header.vue";
import { DETAIL_BLOCK_GAP } from "@/client/config/layout";

defineProps<{
  backLabelKey: TranslationKey;
  backTo: string;
  title: string;
  description?: string;
  compact?: boolean;
}>();
</script>

<template>
  <PageContainer>
    <div class="flex flex-col gap-5 min-w-0">
      <BackButton :label-key="backLabelKey" :to="backTo" />
      <div :class="DETAIL_BLOCK_GAP">
        <PageHeader :compact="compact" :title="title" :description="description" />
        <slot />
      </div>
    </div>
  </PageContainer>
</template>
