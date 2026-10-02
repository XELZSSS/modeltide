import type { RouteRecordRaw } from "vue-router";
import { Activity, Award, Home, Megaphone, Newspaper } from "@lucide/vue";
import {
  qAgent,
  qArtificialRaw,
  qClosedReleasesRaw,
  qHomeDashboardRaw,
  qNewsRaw,
  qOpenRouter,
  qOpenSourceModelsRaw,
  qStatusHistory,
} from "@/client/api/api-queries";
import NotFoundView from "@/client/components/feedback/not-found.vue";
import { DEFAULT_RANKING_TAB, type RankingTabId } from "@/client/config/nav-config";
import { NEWS_CATEGORIES } from "@/shared/config";
import { loadableView } from "@/client/router/lazy-view";
import HomeView from "@/client/features/home/home-view.vue";
import type { Prefetchable } from "@/client/config/route-meta";

const loadRankingsHubView = () => import("@/client/features/rankings/rankings-hub-view.vue");
const loadModelView = () => import("@/client/features/models/model-view.vue");
const loadCompareView = () => import("@/client/features/compare/compare-view.vue");
const loadPriceCompareView = () => import("@/client/features/compare/price-compare-view.vue");
const loadReleasesView = () => import("@/client/features/releases/releases-view.vue");
const loadNewsView = () => import("@/client/features/news/news-view.vue");
const loadStatusView = () => import("@/client/features/status/status-view.vue");
const loadSourceView = () => import("@/client/features/status/source-view.vue");

const RankingsHubView = loadableView(loadRankingsHubView);
const ModelDetailView = loadableView(loadModelView);
const CompareView = loadableView(loadCompareView);
const PriceCompareView = loadableView(loadPriceCompareView);
const ReleasesView = loadableView(loadReleasesView);
const NewsView = loadableView(loadNewsView);
const StatusView = loadableView(loadStatusView);
const SourceDetailView = loadableView(loadSourceView);

const newsPrefetch: readonly Prefetchable[] = [qNewsRaw(NEWS_CATEGORIES[0])];

const RANKING_TAB_QUERIES: Record<RankingTabId, readonly Prefetchable[]> = {
  modelRankings: [qArtificialRaw],
  openRouterRankings: [qOpenRouter],
  openSourceRankings: [qOpenSourceModelsRaw],
  hallucinationRankings: [qArtificialRaw],
  agentRankings: [qAgent],
  providerCompare: [qArtificialRaw],
};

export const ROUTES: RouteRecordRaw[] = [
  {
    path: "/",
    name: "home",
    component: HomeView,
    meta: {
      titleKey: "home",
      prefetch: [qArtificialRaw, qHomeDashboardRaw, qClosedReleasesRaw, qStatusHistory],
      nav: { group: "primary", labelKey: "home", icon: Home },
    },
  },
  {
    path: "/models",
    name: "models",
    component: RankingsHubView,
    meta: {
      titleKey: "rankings",
      load: loadRankingsHubView,
      prefetch: RANKING_TAB_QUERIES[DEFAULT_RANKING_TAB],
      nav: {
        group: "primary",
        labelKey: "rankings",
        icon: Award,
        activePrefixes: ["/model/", "/compare", "/price-compare"],
      },
    },
  },
  {
    path: "/compare",
    name: "compare",
    component: CompareView,
    meta: { titleKey: "modelComparison", load: loadCompareView, prefetch: [qArtificialRaw] },
  },
  {
    path: "/price-compare",
    name: "price",
    component: PriceCompareView,
    meta: { titleKey: "priceComparison", load: loadPriceCompareView, prefetch: [qArtificialRaw] },
  },
  {
    path: "/releases",
    name: "releases",
    component: ReleasesView,
    meta: {
      titleKey: "releases",
      load: loadReleasesView,
      prefetch: [qClosedReleasesRaw],
      nav: { group: "secondary", labelKey: "navReleases", icon: Megaphone },
    },
  },
  {
    path: "/news",
    name: "news",
    component: NewsView,
    meta: {
      titleKey: "aiNews",
      load: loadNewsView,
      prefetch: newsPrefetch,
      nav: { group: "secondary", labelKey: "aiNews", icon: Newspaper },
    },
  },
  {
    path: "/status",
    name: "status",
    component: StatusView,
    meta: {
      titleKey: "statusPageTitle",
      load: loadStatusView,
      prefetch: [qStatusHistory],
      nav: { group: "secondary", labelKey: "navStatus", icon: Activity, activePrefixes: ["/status"] },
    },
  },
  {
    path: "/status/:source",
    name: "source",
    component: SourceDetailView,
    meta: { titleKey: "sourceStatus", load: loadSourceView, prefetch: [qStatusHistory] },
  },
  {
    path: "/model/:id(.*)",
    name: "model",
    component: ModelDetailView,
    meta: { titleKey: "modelDetail", load: loadModelView, prefetch: [qArtificialRaw, qOpenRouter] },
  },
  {
    path: "/:pathMatch(.*)*",
    name: "notFound",
    component: NotFoundView,
    meta: { titleKey: "notFound" },
  },
];
