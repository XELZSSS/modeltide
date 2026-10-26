<script setup lang="ts">
import { computed, type Component } from "vue";
import TabbedPage from "@/client/components/navigation/tabbed-page.vue";
import type { TabItem } from "@/client/components/navigation/tabs";
import SearchInput from "@/client/search/search-input.vue";
import SuspenseQuery from "@/client/router/suspense-query.vue";
import { loadableView, preloadChunk } from "@/client/router/lazy-view";
import { usePrefetchIntent } from "@/client/hooks/use-prefetch";
import { useClientTab } from "@/client/hooks/use-client-tab";
import { useTranslation } from "@/client/i18n";
import {
  DEFAULT_RANKING_TAB,
  isRankingTabId,
  RANKING_TABS,
  RANKING_TAB_SOURCE_LABEL,
  TAB_PARAM,
  type RankingTabId,
} from "@/client/nav/nav-config";
import { RANKING_TAB_DEFS } from "./tab-loaders";

const TAB_COMPONENTS = Object.fromEntries(
  RANKING_TABS.map((id): [RankingTabId, Component] => [id, loadableView(RANKING_TAB_DEFS[id].load)]),
) as Record<RankingTabId, Component>;

const { t } = useTranslation();
const [activeTabId, handleTabChange] = useClientTab(TAB_PARAM, RANKING_TABS, DEFAULT_RANKING_TAB);

const tabs = computed<TabItem[]>(() => RANKING_TABS.map((id) => ({ id, label: t(id) })));
const activeContent = computed(() => TAB_COMPONENTS[activeTabId.value]);
const title = computed(() => t(activeTabId.value));
const description = computed(() => t(RANKING_TAB_SOURCE_LABEL[activeTabId.value]));

const tabIntent = usePrefetchIntent<RankingTabId>((id) => ({
  queries: RANKING_TAB_DEFS[id].queries,
  load: RANKING_TAB_DEFS[id].load,
}));

function onTabIntent(tabId: string, active: boolean): void {
  if (!active) {
    tabIntent.cancel();
    return;
  }
  if (isRankingTabId(RANKING_TABS, tabId)) tabIntent.hover(tabId);
}

function preloadTabs(): void {
  preloadChunk(RANKING_TAB_DEFS.openRouterRankings.load);
}

if (typeof requestIdleCallback === "function") requestIdleCallback(preloadTabs, { timeout: 2000 });
else preloadTabs();
</script>

<template>
  <TabbedPage
    compact
    :title="title"
    :description="description"
    :tabs="tabs"
    :active-tab="activeTabId"
    tab-size="md"
    tab-fill
    @tab-intent="onTabIntent"
    @tab-change="handleTabChange"
  >
    <template #actions><SearchInput /></template>
    <p class="ui-meta">{{ t("dataDisclaimer") }}</p>
    <SuspenseQuery>
      <component :is="activeContent" />
    </SuspenseQuery>
  </TabbedPage>
</template>
