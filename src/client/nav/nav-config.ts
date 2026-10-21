import type { TranslationKey } from "@/shared/i18n";
import { SEARCH_SOURCE_TO_MODEL_SOURCE, SOURCES } from "./sources";

export { SEARCH_SOURCE_TO_MODEL_SOURCE };

export const TAB_PARAM = "tab";
export const AGENT_VIEW_PARAM = "view";

export const RANKING_TABS = [
  "modelRankings",
  "openRouterRankings",
  "openSourceRankings",
  "hallucinationRankings",

  "providerCompare",
] as const;

export type RankingTabId = (typeof RANKING_TABS)[number];

export const DEFAULT_RANKING_TAB: RankingTabId = RANKING_TABS[0];

export const RANKING_TAB_SOURCE_LABEL: Record<RankingTabId, TranslationKey> = {
  modelRankings: SOURCES.aa.labelKey,
  openRouterRankings: SOURCES.or.labelKey,
  openSourceRankings: SOURCES.os.labelKey,
  hallucinationRankings: SOURCES.hall.labelKey,

  providerCompare: SOURCES.aa.labelKey,
};

export const REPO_URL = "https://github.com/XELZSSS/modeltide";

export function isRankingTabId(tabs: readonly string[], value: string): value is RankingTabId {
  return tabs.includes(value);
}
