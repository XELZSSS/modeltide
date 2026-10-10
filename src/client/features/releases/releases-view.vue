<script setup lang="ts">
import PageShell from "@/client/components/layout/page-shell.vue";
import SuspenseQuery from "@/client/router/suspense-query.vue";
import SearchInput from "@/client/search/search-input.vue";
import { useTranslation } from "@/client/i18n";
import ReleasesData from "./releases-data.vue";

const { t } = useTranslation();
</script>

<template>
  <PageShell :title="t('releases')" :description="t('releaseDataSources')">
    <template #actions>
      <SearchInput />
    </template>
    <SuspenseQuery>
      <ReleasesData />
    </SuspenseQuery>
  </PageShell>
</template>
