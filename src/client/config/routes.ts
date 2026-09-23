import { createElement, lazy, type ComponentType, type ReactNode } from "react";
import type { QueryClient } from "@tanstack/react-query";
import { Home, Award, Megaphone, Newspaper, Activity } from "lucide-react";
import {
  qAgent,
  qArtificialRaw,
  qClosedReleasesRaw,
  qHomeDashboardRaw,
  qNewsRaw,
  qOpenRouter,
  qOpenSourceModelsRaw,
  qOpenSourceReleasesRaw,
  qStatusHistory,
} from "@/client/api/api-queries";
import { HomeView } from "@/client/features/home/home-view";
import { DEFAULT_RANKING_TAB, type RankingTabId } from "@/client/config/nav-config";
import { NEWS_CATEGORIES } from "@/shared/config";
import type { TranslationKey } from "@/shared/i18n";

interface Prefetchable {
  prefetch: (qc: QueryClient) => Promise<void>;
}

export type NavGroup = "primary" | "secondary";

interface RouteNav {
  path: string;
  group: NavGroup;
  labelKey: TranslationKey;
  icon: ReactNode;
  activePrefixes?: readonly string[];
}

interface RouteEntry {
  key: string;
  /** Matcher, evaluated in manifest order: exact paths first, then prefixes. */
  match: (pathname: string) => boolean;
  View: ComponentType;
  titleKey: TranslationKey;
  prefetch: readonly Prefetchable[];
  /** The route's chunk, warmed on the same intent as `prefetch`: data alone does not show a lazy view. */
  load?: () => Promise<unknown>;
  nav?: RouteNav;
}

const loadRankingsHubView = () => import("@/client/features/rankings/rankings-hub-view");
const loadModelView = () => import("@/client/features/models/model-view");
const loadCompareView = () => import("@/client/features/compare/compare-view");
const loadPriceCompareView = () => import("@/client/features/compare/price-compare-view");
const loadReleasesView = () => import("@/client/features/releases/releases-view");
const loadNewsView = () => import("@/client/features/news/news-view");
const loadStatusView = () => import("@/client/features/status/status-view");
const loadSourceView = () => import("@/client/features/status/source-view");

const RankingsHubView = lazy(() => loadRankingsHubView().then((m) => ({ default: m.RankingsHubView })));
const ModelDetailView = lazy(() => loadModelView().then((m) => ({ default: m.ModelDetailView })));
const CompareView = lazy(() => loadCompareView().then((m) => ({ default: m.CompareView })));
const PriceCompareView = lazy(() => loadPriceCompareView().then((m) => ({ default: m.PriceCompareView })));
const ReleasesView = lazy(() => loadReleasesView().then((m) => ({ default: m.ReleasesView })));
const NewsView = lazy(() => loadNewsView().then((m) => ({ default: m.NewsView })));
const StatusView = lazy(() => loadStatusView().then((m) => ({ default: m.StatusView })));
const SourceDetailView = lazy(() => loadSourceView().then((m) => ({ default: m.SourceDetailView })));

const newsPrefetch = NEWS_CATEGORIES.map((c) => qNewsRaw(c));

const RANKING_TAB_QUERIES: Record<RankingTabId, readonly Prefetchable[]> = {
  modelRankings: [qArtificialRaw],
  openRouterRankings: [qOpenRouter],
  openSourceRankings: [qOpenSourceModelsRaw],
  hallucinationRankings: [qArtificialRaw],
  agentRankings: [qAgent],
  providerCompare: [qArtificialRaw],
};

/** Order matters: exact paths first, then the two `/…/` prefix routes. */
export const ROUTES: readonly RouteEntry[] = [
  {
    key: "home",
    match: (p) => p === "/",
    View: HomeView,
    titleKey: "home",
    prefetch: [qArtificialRaw, qHomeDashboardRaw, qClosedReleasesRaw, qOpenSourceReleasesRaw, qStatusHistory],
    nav: { path: "/", group: "primary", labelKey: "home", icon: createElement(Home, { size: 18 }) },
  },
  {
    key: "models",
    match: (p) => p === "/models",
    View: RankingsHubView,
    load: loadRankingsHubView,
    titleKey: "rankings",
    prefetch: RANKING_TAB_QUERIES[DEFAULT_RANKING_TAB],
    nav: {
      path: "/models",
      group: "primary",
      labelKey: "rankings",
      icon: createElement(Award, { size: 18 }),
      activePrefixes: ["/model/", "/compare", "/price-compare"],
    },
  },
  {
    key: "compare",
    match: (p) => p === "/compare",
    View: CompareView,
    load: loadCompareView,
    titleKey: "modelComparison",
    prefetch: [qArtificialRaw],
  },
  {
    key: "price",
    match: (p) => p === "/price-compare",
    View: PriceCompareView,
    load: loadPriceCompareView,
    titleKey: "priceComparison",
    prefetch: [qArtificialRaw],
  },
  {
    key: "releases",
    match: (p) => p === "/releases",
    View: ReleasesView,
    load: loadReleasesView,
    titleKey: "releases",
    prefetch: [qOpenSourceReleasesRaw, qClosedReleasesRaw],
    nav: {
      path: "/releases",
      group: "secondary",
      labelKey: "navReleases",
      icon: createElement(Megaphone, { size: 18 }),
    },
  },
  {
    key: "news",
    match: (p) => p === "/news",
    View: NewsView,
    load: loadNewsView,
    titleKey: "aiNews",
    prefetch: newsPrefetch,
    nav: { path: "/news", group: "secondary", labelKey: "aiNews", icon: createElement(Newspaper, { size: 18 }) },
  },
  {
    key: "status",
    match: (p) => p === "/status",
    View: StatusView,
    load: loadStatusView,
    titleKey: "statusPageTitle",
    prefetch: [qStatusHistory],
    nav: {
      path: "/status",
      group: "secondary",
      labelKey: "navStatus",
      icon: createElement(Activity, { size: 18 }),
      activePrefixes: ["/status"],
    },
  },
  {
    key: "model",
    match: (p) => p.startsWith("/model/"),
    View: ModelDetailView,
    load: loadModelView,
    titleKey: "modelDetail",
    prefetch: [qArtificialRaw, qOpenRouter],
  },
  {
    key: "source",
    match: (p) => p.startsWith("/status/"),
    View: SourceDetailView,
    load: loadSourceView,
    titleKey: "sourceStatus",
    prefetch: [qStatusHistory],
  },
];

/** Prefetches every listed query in order; the calls are fire-and-forget. */
function prefetchAll(qc: QueryClient, queries: readonly Prefetchable[]): void {
  for (const q of queries) void q.prefetch(qc);
}

export const findRoute = (pathname: string): RouteEntry | undefined => ROUTES.find((r) => r.match(pathname));

export const prefetchQueriesForRoute = (qc: QueryClient, pathname: string): void => {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  const route = findRoute(path);
  if (route) prefetchAll(qc, route.prefetch);
};
