<script setup lang="ts">
import { computed } from "vue";
import { useTranslation } from "@/client/i18n";
import TabbedPage from "@/client/components/navigation/tabbed-page.vue";
import SuspenseQuery from "@/client/router/suspense-query.vue";
import { useClientTab } from "@/client/hooks/use-client-tab";
import { usePrefetchIntent } from "@/client/hooks/use-prefetch";
import { qNewsByCategory } from "@/client/api/query/catalog";
import type { TabItem } from "@/client/components/navigation/tabs";
import type { TranslationKey } from "@/shared/i18n";
import type { NewsCategory } from "@/shared/types";
import { NEWS_CATEGORIES } from "@/shared/types/news";
import { TAB_PARAM } from "@/client/nav/nav-config";
import NewsCategoryData from "./news-category-data.vue";

const CATEGORY_LABELS: Record<NewsCategory, TranslationKey> = {
  industry: "catIndustry",
  opensource: "catOpenSource",
  hardware: "catHardware",
  research: "catResearch",
};

const { t } = useTranslation();
const [activeCategory, setActiveCategory] = useClientTab(TAB_PARAM, NEWS_CATEGORIES, NEWS_CATEGORIES[0]!);

const tabs = computed<TabItem[]>(() => NEWS_CATEGORIES.map((id) => ({ id, label: t(CATEGORY_LABELS[id]) })));

// Each category is its own request, so the tab strip prefetches on intent the way the ranking hub does: hovering or
// touching a tab starts that category's fetch before the click lands.
const tabIntent = usePrefetchIntent<NewsCategory>((id) => ({ queries: [qNewsByCategory(id)] }));

function isNewsCategory(value: string): value is NewsCategory {
  return (NEWS_CATEGORIES as readonly string[]).includes(value);
}

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
    @tab-change="setActiveCategory"
    @tab-intent="onTabIntent"
  >
    <SuspenseQuery>
      <NewsCategoryData :key="activeCategory" :category-id="activeCategory" />
    </SuspenseQuery>
  </TabbedPage>
</template>
