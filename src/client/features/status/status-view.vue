<script setup lang="ts">
import { useTranslation } from "@/client/i18n";
import PageShell from "@/client/components/layout/page-shell.vue";
import SuspenseQuery from "@/client/router/suspense-query.vue";
import StatusContent from "@/client/features/status/status-content.vue";

const { t } = useTranslation();
</script>

<template>
  <PageShell :title="t('statusPageTitle')" :description="t('sourceStatus')">
    <SuspenseQuery>
      <StatusContent />
    </SuspenseQuery>
  </PageShell>
</template>
