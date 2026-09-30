<script setup lang="ts">
import { useTranslation } from "@/client/i18n";
import PageContainer from "@/client/components/layout/page-container.vue";
import PageHeader from "@/client/components/layout/page-header.vue";
import SuspenseQuery from "@/client/router/suspense-query.vue";
import StatusContent from "@/client/features/status/status-content.vue";

const { t } = useTranslation();
</script>

<template>
  <PageContainer>
    <PageHeader :title="t('statusPageTitle')" :description="t('sourceStatus')" />
    <SuspenseQuery>
      <StatusContent />
    </SuspenseQuery>
  </PageContainer>
</template>
