<script setup lang="ts">
import { computed, type Component } from "vue";
import TabbedPage from "@/client/components/layout/tabbed-page.vue";
import SearchInput from "@/client/search/search-input.vue";
import SuspenseQuery from "@/client/router/suspense-query.vue";
import { useClientTab } from "@/client/hooks/use-client-tab";
import { useTranslation } from "@/client/i18n";
import { loadableView } from "@/client/router/lazy-view";
import { DEFAULT_RANKING_TAB, MODEL_SOURCES, RANKING_TABS, type RankingTabId } from "@/client/config/nav-config";
import type { TabItem } from "@/client/components/ui/tabs";
import type { TranslationKey } from "@/shared/i18n";
import ModelRankingsTab from "./model-rankings-tab.vue";
import OpenRouterTab from "./open-router-tab.vue";
import OpenSourceTab from "./open-source-tab.vue";
import HallucinationRankingsTab from "./hallucination-rankings-tab.vue";
import ProviderCompareTab from "./provider-compare-tab.vue";

const AgentRankingsTab = loadableView(() => import("./agent-view.vue"));

const TAB_SOURCE_LABEL: Record<RankingTabId, TranslationKey> = {
  modelRankings: MODEL_SOURCES.aa.sourceLabelKey,
  openRouterRankings: MODEL_SOURCES.or.sourceLabelKey,
  openSourceRankings: MODEL_SOURCES.os.sourceLabelKey,
  hallucinationRankings: MODEL_SOURCES.hall.sourceLabelKey,
  agentRankings: "agentSource",
  providerCompare: MODEL_SOURCES.aa.sourceLabelKey,
};

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
const description = computed(() => t(TAB_SOURCE_LABEL[activeTabId.value]));
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
