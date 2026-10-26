import type { TranslationKey } from "@/shared/i18n";
import { SOURCES } from "./sources";
import { SITE_URLS } from "@/shared/config/sites";

// Both names describe the URL shape `src/client/router/paths.ts` owns, and are re-exported here because the tab hooks
// that read them live next to the tab configuration rather than next to the router.
export { TAB_PARAM, VIEW_PARAM } from "@/client/router/paths";

export const RANKING_TABS = [
  "modelRankings",
  "openRouterRankings",
  "openSourceRankings",
  "hallucinationRankings",
  "decisionRankings",

  "providerCompare",
] as const;

export type RankingTabId = (typeof RANKING_TABS)[number];

export const DEFAULT_RANKING_TAB: RankingTabId = RANKING_TABS[0];

export const RANKING_TAB_SOURCE_LABEL: Record<RankingTabId, TranslationKey> = {
  modelRankings: SOURCES.aa.labelKey,
  openRouterRankings: SOURCES.or.labelKey,
  openSourceRankings: SOURCES.os.labelKey,
  hallucinationRankings: SOURCES.hall.labelKey,
  decisionRankings: SOURCES.aa.labelKey,

  providerCompare: SOURCES.aa.labelKey,
};

export const REPO_URL = SITE_URLS.repository;

export function isRankingTabId(tabs: readonly string[], value: string): value is RankingTabId {
  return tabs.includes(value);
}
