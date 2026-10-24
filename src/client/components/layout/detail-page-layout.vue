<script setup lang="ts">
/**
 * The detail-page skeleton: back button, then the heading, then the view's own blocks at the detail rhythm. Pages
 * supply the return target and the labels; the spacing between every detail page comes from here.
 */
import type { TranslationKey } from "@/shared/i18n";
import BackButton from "@/client/shell/back-button.vue";
import PageContainer from "@/client/components/layout/page-container.vue";
import PageHeader from "@/client/components/layout/page-header.vue";
import { DETAIL_BLOCK_GAP } from "@/client/nav/layout";

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
    <div class="flex min-w-0 flex-col gap-5">
      <BackButton :label-key="backLabelKey" :to="backTo" />
      <div :class="DETAIL_BLOCK_GAP">
        <PageHeader :compact="compact" :title="title" :description="description" />
        <slot />
      </div>
    </div>
  </PageContainer>
</template>
