import type { RouteRecordRaw } from "vue-router";
import { Award, Home, Megaphone, Newspaper } from "@lucide/vue";
import {
  qArtificialList,
  qClosedReleasesList,
  qHomeDashboard,
  qNewsByCategory,
  qOpenRouterList,
} from "@/client/api/query/catalog";
import { NEWS_CATEGORIES } from "@/shared/types/news";
import { DEFAULT_RANKING_TAB } from "@/client/nav/nav-config";
import { loadableView, preloadChunk } from "./lazy-view";
import { RANKING_TAB_DEFS } from "@/client/pages/rankings/tab-loaders";
import type { Prefetchable } from "./route-meta";
import { PATHS } from "./paths";

const loadHomeView = () => import("@/client/pages/home/home-view.vue");
const loadRankingsHubView = () => {
  preloadChunk(RANKING_TAB_DEFS[DEFAULT_RANKING_TAB].load);
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

const newsPrefetch: readonly Prefetchable[] = [qNewsByCategory(NEWS_CATEGORIES[0]!)];

export const ROUTES: RouteRecordRaw[] = [
  {
    path: PATHS.home,
    name: "home",
    component: HomeView,
    meta: {
      titleKey: "home",
      load: loadHomeView,
      prefetch: [qHomeDashboard],
      nav: { group: "primary", labelKey: "home", icon: Home },
    },
  },
  {
    path: PATHS.rankings,
    // Named for the page it renders rather than for its path segment: this is the ranking hub whose tabs are
    // `RANKING_TABS` in `nav/nav-config.ts`, and a route named after the URL segment read as if it were a model list.
    name: "rankings",
    component: RankingsHubView,
    meta: {
      titleKey: "rankings",
      load: loadRankingsHubView,
      prefetch: RANKING_TAB_DEFS[DEFAULT_RANKING_TAB].queries,
      nav: {
        group: "primary",
        labelKey: "rankings",
        icon: Award,
        activePrefixes: [PATHS.modelDetailPrefix, PATHS.compare, PATHS.priceCompare],
      },
    },
  },
  {
    path: PATHS.compare,
    name: "compare",
    component: CompareView,
    meta: { titleKey: "modelComparison", load: loadCompareView, prefetch: [qArtificialList] },
  },
  {
    path: PATHS.priceCompare,
    name: "priceCompare",
    component: PriceCompareView,
    meta: { titleKey: "priceComparison", load: loadPriceCompareView, prefetch: [qArtificialList] },
  },
  {
    path: PATHS.releases,
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
    path: PATHS.news,
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
    path: PATHS.modelDetail,
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
