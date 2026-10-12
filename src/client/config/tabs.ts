import type { RankingTabId } from "@/client/config/nav-config";
import type { NewsCategory } from "@/shared/types";

export const RANKING_TAB_PARAM = "tab";
export const AGENT_VIEW_PARAM = "view";
export const NEWS_TAB_PARAM = "tab";

export function isRankingTabId(tabs: readonly string[], value: string): value is RankingTabId {
  return tabs.includes(value);
}

export function isNewsCategoryValue(value: string, categories: readonly NewsCategory[]): value is NewsCategory {
  return (categories as readonly string[]).includes(value);
}
