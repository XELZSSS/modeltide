<script setup lang="ts">
import { computed, type Component } from "vue";
import TabbedPage from "@/client/components/layout/tabbed-page.vue";
import SearchInput from "@/client/search/search-input.vue";
import SuspenseQuery from "@/client/router/suspense-query.vue";
import { useClientTab } from "@/client/hooks/use-client-tab";
import { useTranslation } from "@/client/i18n";
import AgentRankingsTab from "./agent-view.vue";
import {
  DEFAULT_RANKING_TAB,
  RANKING_TABS,
  RANKING_TAB_SOURCE_LABEL,
  type RankingTabId,
} from "@/client/config/nav-config";
import type { TabItem } from "@/client/components/ui/tabs";
import ModelRankingsTab from "./model-rankings-tab.vue";
import OpenRouterTab from "./open-router-tab.vue";
import OpenSourceTab from "./open-source-tab.vue";
import HallucinationRankingsTab from "./hallucination-rankings-tab.vue";
import ProviderCompareTab from "./provider-compare-tab.vue";

const TAB_COMPONENTS: Record<RankingTabId, Component> = {
  modelRankings: ModelRankingsTab,
  openRouterRankings: OpenRouterTab,
  openSourceRankings: OpenSourceTab,
  hallucinationRankings: HallucinationRankingsTab,
  agentRankings: AgentRankingsTab,
  providerCompare: ProviderCompareTab,
};

const { t } = useTranslation();
const [activeTabId, handleTabChange] = useClientTab("tab", RANKING_TABS, DEFAULT_RANKING_TAB);

const tabs = computed<TabItem[]>(() => RANKING_TABS.map((id) => ({ id, label: t(id) })));
const activeContent = computed(() => TAB_COMPONENTS[activeTabId.value]);
const title = computed(() => t(activeTabId.value));
const description = computed(() => t(RANKING_TAB_SOURCE_LABEL[activeTabId.value]));
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
    @tab-change="handleTabChange"
  >
    <template #actions><SearchInput /></template>
    <SuspenseQuery>
      <component :is="activeContent" />
    </SuspenseQuery>
  </TabbedPage>
</template>
