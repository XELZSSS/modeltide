import type { RouteRecordRaw } from "vue-router";
import { Award, Home, Megaphone, Newspaper } from "@lucide/vue";
import { qArtificialList, qClosedReleasesList, qHomeDashboard, qNews, qOpenRouterList } from "@/client/api/catalog";
import { DEFAULT_RANKING_TAB } from "@/client/nav/nav-config";
import { loadableView, preloadChunk } from "./lazy-view";
import { RANKING_TAB_LOADS, RANKING_TAB_QUERIES } from "@/client/pages/rankings/tab-loaders";
import type { Prefetchable } from "./route-meta";

const loadHomeView = () => import("@/client/pages/home/home-view.vue");
const loadRankingsHubView = () => {
  preloadChunk(RANKING_TAB_LOADS[DEFAULT_RANKING_TAB]);
  return import("@/client/pages/rankings/rankings-hub-view.vue");
};
const loadModelView = () => import("@/client/pages/model/model-view.vue");
const loadCompareView = () => import("@/client/pages/compare/compare-view.vue");
const loadPriceCompareView = () => import("@/client/pages/compare/price-compare-view.vue");
const loadReleasesView = () => import("@/client/pages/releases/releases-view.vue");
const loadNewsView = () => import("@/client/pages/news/news-view.vue");

const HomeView = loadableView(loadHomeView);
const RankingsHubView = loadableView(loadRankingsHubView);
const ModelDetailView = loadableView(loadModelView);
const CompareView = loadableView(loadCompareView);
const PriceCompareView = loadableView(loadPriceCompareView);
const ReleasesView = loadableView(loadReleasesView);
const NewsView = loadableView(loadNewsView);

const newsPrefetch: readonly Prefetchable[] = [qNews];

export { RANKING_TAB_QUERIES };

export const ROUTES: RouteRecordRaw[] = [
  {
    path: "/",
    name: "home",
    component: HomeView,
    meta: {
      titleKey: "home",
      load: loadHomeView,
      prefetch: [qArtificialList, qHomeDashboard, qClosedReleasesList],
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
    meta: { titleKey: "modelComparison", load: loadCompareView, prefetch: [qArtificialList] },
  },
  {
    path: "/price-compare",
    name: "price",
    component: PriceCompareView,
    meta: { titleKey: "priceComparison", load: loadPriceCompareView, prefetch: [qArtificialList] },
  },
  {
    path: "/releases",
    name: "releases",
    component: ReleasesView,
    meta: {
      titleKey: "releases",
      load: loadReleasesView,
      prefetch: [qClosedReleasesList],
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
    path: "/model/:id(.*)",
    name: "model",
    component: ModelDetailView,
    meta: { titleKey: "modelDetail", load: loadModelView, prefetch: [qArtificialList, qOpenRouterList] },
  },
  {
    path: "/:pathMatch(.*)*",
    name: "notFound",
    component: loadableView(() => import("@/client/components/feedback/not-found.vue")),
    meta: { titleKey: "notFound" },
  },
];
