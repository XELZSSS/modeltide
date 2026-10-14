import type { RouteRecordRaw } from "vue-router";
import { Award, Home, Megaphone, Newspaper } from "@lucide/vue";
import {
  qArtificialList,
  qClosedReleasesList,
  qHomeDashboard,
  qNewsList,
  qOpenRouterList,
} from "@/client/api/api-queries";
import NotFoundView from "@/client/components/feedback/not-found.vue";
import { DEFAULT_RANKING_TAB } from "@/client/config/nav-config";
import { NEWS_CATEGORIES } from "@/shared/config";
import { loadableView } from "@/client/router/lazy-view";
import { preloadChunk } from "@/client/router/prefetch";
import { RANKING_TAB_LOADS, RANKING_TAB_QUERIES } from "@/client/features/rankings/tab-loaders";
import HomeView from "@/client/features/home/home-view.vue";
import type { Prefetchable } from "@/client/config/route-meta";

const loadRankingsHubView = () => {
  preloadChunk(RANKING_TAB_LOADS[DEFAULT_RANKING_TAB]);
  return import("@/client/features/rankings/rankings-hub-view.vue");
};
const loadModelView = () => import("@/client/features/models/model-view.vue");
const loadCompareView = () => import("@/client/features/compare/compare-view.vue");
const loadPriceCompareView = () => import("@/client/features/compare/price-compare-view.vue");
const loadReleasesView = () => import("@/client/features/releases/releases-view.vue");
const loadNewsView = () => import("@/client/features/news/news-view.vue");

const RankingsHubView = loadableView(loadRankingsHubView);
const ModelDetailView = loadableView(loadModelView);
const CompareView = loadableView(loadCompareView);
const PriceCompareView = loadableView(loadPriceCompareView);
const ReleasesView = loadableView(loadReleasesView);
const NewsView = loadableView(loadNewsView);

const newsPrefetch: readonly Prefetchable[] = [qNewsList(NEWS_CATEGORIES[0])];

export { RANKING_TAB_QUERIES };

export const ROUTES: RouteRecordRaw[] = [
  {
    path: "/",
    name: "home",
    component: HomeView,
    meta: {
      titleKey: "home",
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
    component: NotFoundView,
    meta: { titleKey: "notFound" },
  },
];
