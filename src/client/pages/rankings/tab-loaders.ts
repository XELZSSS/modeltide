import type { Component } from "vue";
import { qArtificialList, qOpenRouterList, qOpenSourceModelsList } from "@/client/api/catalog";
import type { Prefetchable } from "@/client/router/route-meta";
import type { RankingTabId } from "@/client/nav/nav-config";

interface RankingTabDef {
  load: () => Promise<{ default: Component }>;
  queries: readonly Prefetchable[];
}

const RANKING_TAB_DEFS: Record<RankingTabId, RankingTabDef> = {
  modelRankings: { load: () => import("./model-rankings-tab.vue"), queries: [qArtificialList] },
  openRouterRankings: { load: () => import("./open-router-tab.vue"), queries: [qOpenRouterList] },
  openSourceRankings: { load: () => import("./open-source-tab.vue"), queries: [qOpenSourceModelsList] },
  hallucinationRankings: { load: () => import("./hallucination-rankings-tab.vue"), queries: [qArtificialList] },
  providerCompare: { load: () => import("./provider-compare-tab.vue"), queries: [qArtificialList] },
};

const tabIds = Object.keys(RANKING_TAB_DEFS) as RankingTabId[];

export const RANKING_TAB_LOADS: Record<RankingTabId, () => Promise<{ default: Component }>> = Object.fromEntries(
  tabIds.map((id) => [id, RANKING_TAB_DEFS[id]!.load]),
) as Record<RankingTabId, () => Promise<{ default: Component }>>;

export const RANKING_TAB_QUERIES: Record<RankingTabId, readonly Prefetchable[]> = Object.fromEntries(
  tabIds.map((id) => [id, RANKING_TAB_DEFS[id]!.queries]),
) as Record<RankingTabId, readonly Prefetchable[]>;
