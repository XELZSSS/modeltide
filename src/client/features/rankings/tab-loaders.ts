import type { Component } from "vue";
import { qAgent, qArtificialRaw, qOpenRouter, qOpenSourceModelsRaw } from "@/client/api/api-queries";
import type { Prefetchable } from "@/client/config/route-meta";
import type { RankingTabId } from "@/client/config/nav-config";

interface RankingTabDef {
  load: () => Promise<{ default: Component }>;
  queries: readonly Prefetchable[];
}

export const RANKING_TAB_DEFS: Record<RankingTabId, RankingTabDef> = {
  modelRankings: { load: () => import("./model-rankings-tab.vue"), queries: [qArtificialRaw] },
  openRouterRankings: { load: () => import("./open-router-tab.vue"), queries: [qOpenRouter] },
  openSourceRankings: { load: () => import("./open-source-tab.vue"), queries: [qOpenSourceModelsRaw] },
  hallucinationRankings: { load: () => import("./hallucination-rankings-tab.vue"), queries: [qArtificialRaw] },
  agentRankings: { load: () => import("./agent-view.vue"), queries: [qAgent] },
  providerCompare: { load: () => import("./provider-compare-tab.vue"), queries: [qArtificialRaw] },
};

const tabIds = Object.keys(RANKING_TAB_DEFS) as RankingTabId[];

export const RANKING_TAB_LOADS: Record<RankingTabId, () => Promise<{ default: Component }>> =
  Object.fromEntries(tabIds.map((id) => [id, RANKING_TAB_DEFS[id]!.load])) as Record<
    RankingTabId,
    () => Promise<{ default: Component }>
  >;

export const RANKING_TAB_QUERIES: Record<RankingTabId, readonly Prefetchable[]> = Object.fromEntries(
  tabIds.map((id) => [id, RANKING_TAB_DEFS[id]!.queries]),
) as Record<RankingTabId, readonly Prefetchable[]>;
