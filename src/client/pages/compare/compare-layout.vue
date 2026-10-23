<script setup lang="ts">
import { useTranslation } from "@/client/i18n";
import DetailPageLayout from "@/client/components/layout/detail-page-layout.vue";
import SuspenseQuery from "@/client/router/suspense-query.vue";
import type { ArtificialAnalysisModel } from "@/shared/types";
import CompareContent from "./compare-content.vue";

const props = defineProps<{ backTo: string; title: string }>();

defineSlots<{ default?: (slotProps: { models: ArtificialAnalysisModel[] }) => unknown }>();

const { t } = useTranslation();
</script>

<template>
  <!--
    The page frame (back button, title, source line) is rendered before any data is read, so a cold open shows a real page
    that is still filling in rather than an empty screen; only the comparison body suspends.
  -->
  <DetailPageLayout
    back-label-key="back"
    :back-to="props.backTo"
    :title="props.title"
    :description="t('artificialSource')"
    compact
  >
    <SuspenseQuery>
      <CompareContent :back-to="props.backTo">
        <template #default="slotProps"><slot :models="slotProps.models" /></template>
      </CompareContent>
    </SuspenseQuery>
  </DetailPageLayout>
</template>
