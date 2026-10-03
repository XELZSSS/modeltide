<script setup lang="ts">
import { computed, type Component } from "vue";
import TabbedPage from "@/client/components/layout/tabbed-page.vue";
import type { TabItem } from "@/client/components/ui/tabs";
import SearchInput from "@/client/search/search-input.vue";
import SuspenseQuery from "@/client/router/suspense-query.vue";
import { loadableView } from "@/client/router/lazy-view";
import { preloadChunk } from "@/client/router/prefetch";
import { usePrefetchIntent } from "@/client/hooks/use-prefetch-intent";
import { useClientTab } from "@/client/hooks/use-client-tab";
import { useTranslation } from "@/client/i18n";
import {
  DEFAULT_RANKING_TAB,
  RANKING_TABS,
  RANKING_TAB_SOURCE_LABEL,
  type RankingTabId,
} from "@/client/config/nav-config";
import { RANKING_TAB_QUERIES } from "@/client/config/routes";
import { RANKING_TAB_LOADS } from "./tab-loaders";

const TAB_COMPONENTS = Object.fromEntries(
  RANKING_TABS.map((id): [RankingTabId, Component] => [id, loadableView(RANKING_TAB_LOADS[id])]),
) as Record<RankingTabId, Component>;

const { t } = useTranslation();
const [activeTabId, handleTabChange] = useClientTab("tab", RANKING_TABS, DEFAULT_RANKING_TAB);

const tabs = computed<TabItem[]>(() => RANKING_TABS.map((id) => ({ id, label: t(id) })));
const activeContent = computed(() => TAB_COMPONENTS[activeTabId.value]);
const title = computed(() => t(activeTabId.value));
const description = computed(() => t(RANKING_TAB_SOURCE_LABEL[activeTabId.value]));

function isRankingTabId(value: string): value is RankingTabId {
  return (RANKING_TABS as readonly string[]).includes(value);
}

const tabIntent = usePrefetchIntent<RankingTabId>((id) => ({
  queries: RANKING_TAB_QUERIES[id],
  load: RANKING_TAB_LOADS[id],
}));

function onTabIntent(tabId: string, active: boolean): void {
  if (!active) {
    tabIntent.cancel();
    return;
  }
  if (isRankingTabId(tabId)) tabIntent.hover(tabId);
}

function preloadTabs(): void {
  for (const id of RANKING_TABS) preloadChunk(RANKING_TAB_LOADS[id]);
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
    <SuspenseQuery>
      <component :is="activeContent" />
    </SuspenseQuery>
  </TabbedPage>
</template>
