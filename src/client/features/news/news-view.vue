<script setup lang="ts">
import { computed } from "vue";
import { useTranslation } from "@/client/i18n";
import { qNewsRaw } from "@/client/api/api-queries";
import TabbedPage from "@/client/components/layout/tabbed-page.vue";
import SuspenseQuery from "@/client/router/suspense-query.vue";
import { useClientTab } from "@/client/hooks/use-client-tab";
import { usePrefetchIntent } from "@/client/hooks/use-prefetch-intent";
import type { TabItem } from "@/client/components/ui/tabs";
import type { TranslationKey } from "@/shared/i18n";
import type { NewsCategory } from "@/shared/types";
import { NEWS_CATEGORIES } from "@/shared/config";
import NewsCategoryData from "./news-category-data.vue";

const CATEGORY_LABELS: Record<NewsCategory, TranslationKey> = {
  industry: "catIndustry",
  opensource: "catOpenSource",
  hardware: "catHardware",
  funding: "catFunding",
  research: "catResearch",
};

const { t } = useTranslation();
const [activeCategory, setActiveCategory] = useClientTab("tab", NEWS_CATEGORIES, NEWS_CATEGORIES[0]!);

const tabs = computed<TabItem[]>(() => NEWS_CATEGORIES.map((id) => ({ id, label: t(CATEGORY_LABELS[id]) })));

function isNewsCategory(value: string): value is NewsCategory {
  return (NEWS_CATEGORIES as readonly string[]).includes(value);
}

const tabIntent = usePrefetchIntent<NewsCategory>((id) => ({ queries: [qNewsRaw(id)] }));

function onTabIntent(tabId: string, active: boolean): void {
  if (!active) {
    tabIntent.cancel();
    return;
  }
  if (isNewsCategory(tabId)) tabIntent.hover(tabId);
}
</script>

<template>
  <TabbedPage
    :title="t('aiNews')"
    :tabs="tabs"
    :active-tab="activeCategory"
    @tab-intent="onTabIntent"
    @tab-change="setActiveCategory"
  >
    <SuspenseQuery>
      <NewsCategoryData :key="activeCategory" :category-id="activeCategory" />
    </SuspenseQuery>
  </TabbedPage>
</template>
