import type { Component } from "vue";
import type { RankingTabId } from "@/client/config/nav-config";

export const RANKING_TAB_LOADS: Record<RankingTabId, () => Promise<{ default: Component }>> = {
  modelRankings: () => import("./model-rankings-tab.vue"),
  openRouterRankings: () => import("./open-router-tab.vue"),
  openSourceRankings: () => import("./open-source-tab.vue"),
  hallucinationRankings: () => import("./hallucination-rankings-tab.vue"),
  agentRankings: () => import("./agent-view.vue"),
  providerCompare: () => import("./provider-compare-tab.vue"),
};
