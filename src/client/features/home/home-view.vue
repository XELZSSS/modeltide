<script setup lang="ts">
import { useTranslation } from "@/client/i18n";
import PageContainer from "@/client/components/layout/page-container.vue";
import SuspenseQuery from "@/client/router/suspense-query.vue";
import SearchInput from "@/client/search/search-input.vue";
import { PAGE_BLOCK_GAP } from "@/client/config/layout";
import HomeLatestEvents from "./home-latest-events.vue";
import HomeContent from "./home-content.vue";

const { t } = useTranslation();
</script>

<template>
  <PageContainer>
    <h1 class="sr-only">{{ t("home") }}</h1>
    <div :class="PAGE_BLOCK_GAP">
      <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4 min-w-0">
        <div class="hidden md:block md:col-span-2 lg:col-span-3 min-w-0">
          <Suspense>
            <HomeLatestEvents />
            <template #fallback>
              <div class="h-9 w-full ui-card" aria-hidden="true" />
            </template>
          </Suspense>
        </div>
        <div class="min-w-0 col-span-2 sm:col-span-3 md:col-span-1 flex">
          <SearchInput class="w-full" />
        </div>
      </div>
      <SuspenseQuery>
        <HomeContent />
      </SuspenseQuery>
    </div>
  </PageContainer>
</template>
