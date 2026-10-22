<script setup lang="ts">
import { useTranslation } from "@/client/i18n";
import PageContainer from "@/client/components/layout/page-container.vue";
import SuspenseQuery from "@/client/router/suspense-query.vue";
import HomeContent from "./home-content.vue";

const { t } = useTranslation();
</script>

<template>
  <PageContainer>
    <h1 class="sr-only">{{ t("home") }}</h1>
    <SuspenseQuery>
      <HomeContent />
    </SuspenseQuery>
  </PageContainer>
</template>
