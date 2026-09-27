<script setup lang="ts">
import { useTranslation } from "@/client/i18n";
import PageContainer from "@/client/components/layout/page-container.vue";
import PageHeader from "@/client/components/layout/page-header.vue";
import PageSection from "@/client/components/layout/page-section.vue";
import Card from "@/client/components/ui/card.vue";
import CardContent from "@/client/components/ui/card-content.vue";
import SuspenseQuery from "@/client/router/suspense-query.vue";
import StatusContent from "@/client/features/status/status-content.vue";

const { t } = useTranslation();
</script>

<template>
  <PageContainer>
    <PageHeader :title="t('statusPageTitle')" :description="t('sourceStatus')" />
    <SuspenseQuery>
      <StatusContent />
      <template #fallback>
        <Card>
          <CardContent class="flex items-center gap-3 py-4">
            <div class="h-4 w-full max-w-64 ui-skeleton" aria-hidden="true" />
          </CardContent>
        </Card>
        <PageSection>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <div class="h-40 ui-skeleton" aria-hidden="true" />
            <div class="h-40 ui-skeleton" aria-hidden="true" />
          </div>
        </PageSection>
      </template>
    </SuspenseQuery>
  </PageContainer>
</template>
