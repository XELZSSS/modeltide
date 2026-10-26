import type { Component } from "vue";
import { qArtificialList, qDecisionIndex, qOpenRouterList, qOpenSourceModelsList } from "@/client/api/query/catalog";
import type { Prefetchable } from "@/client/router/route-meta";
import type { RankingTabId } from "@/client/nav/nav-config";

/**
 * The tab table itself: `load` is the lazy import the hub renders and the router preloads, `queries` is what a tab
 * prefetches on intent. One entry per tab, so a new tab cannot arrive with only one of the two.
 */
export const RANKING_TAB_DEFS: Record<
  RankingTabId,
  { readonly load: () => Promise<{ default: Component }>; readonly queries: readonly Prefetchable[] }
> = {
  modelRankings: { load: () => import("./model-rankings-tab.vue"), queries: [qArtificialList] },
  openRouterRankings: { load: () => import("./open-router-tab.vue"), queries: [qOpenRouterList] },
  openSourceRankings: { load: () => import("./open-source-tab.vue"), queries: [qOpenSourceModelsList] },
  hallucinationRankings: { load: () => import("./hallucination-rankings-tab.vue"), queries: [qArtificialList] },
  decisionRankings: { load: () => import("./decision-rankings-tab.vue"), queries: [qDecisionIndex] },
  providerCompare: { load: () => import("./provider-compare-tab.vue"), queries: [qArtificialList] },
};
