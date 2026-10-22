<script setup lang="ts">
import PageContainer from "@/client/components/layout/page-container.vue";
import PageHeader from "@/client/components/layout/page-header.vue";
import { PAGE_BLOCK_GAP } from "@/client/nav/layout";
import SuspenseQuery from "@/client/router/suspense-query.vue";
import SearchInput from "@/client/search/search-input.vue";
import { useTranslation } from "@/client/i18n";
import ReleasesData from "./releases-data.vue";

const { t } = useTranslation();
</script>

<template>
  <PageContainer>
    <div :class="PAGE_BLOCK_GAP">
      <PageHeader :title="t('releases')" :description="t('releaseDataSources')">
        <template #actions>
          <SearchInput />
        </template>
      </PageHeader>
      <SuspenseQuery>
        <ReleasesData />
      </SuspenseQuery>
    </div>
  </PageContainer>
</template>
