import { lazy, useLayoutEffect } from "react";
import { Route, Routes, useLocation } from "react-router";
import { useSearchStore } from "@/client/stores";
import { NotFound } from "@/client/components/shared";

// Route-level lazy() splits each view into its own chunk.
function lazyView<T extends object>(load: () => Promise<T>, name: keyof T) {
  return lazy(() => load().then((m) => ({ default: m[name] as React.ComponentType })));
}
const HomeView = lazyView(() => import("./features/home/HomeView"), "HomeView");
const RankingsHubView = lazyView(() => import("./features/rankings/RankingsHubView"), "RankingsHubView");
const ReleasesView = lazyView(() => import("./features/releases/ReleasesView"), "ReleasesView");
// Separate entry modules keep /compare and /price-compare in independent chunks.
const CompareView = lazyView(() => import("./features/compare/CompareView.lazy"), "CompareView");
const PriceCompareView = lazyView(() => import("./features/compare/PriceCompareView.lazy"), "PriceCompareView");
const NewsView = lazyView(() => import("./features/news/NewsView"), "NewsView");
const ModelDetailView = lazyView(() => import("./features/models/ModelDetailView"), "ModelDetailView");
const StatusView = lazyView(() => import("./features/status/StatusView"), "StatusView");
const SourceDetailView = lazyView(() => import("./features/status/SourceDetailView"), "SourceDetailView");

/** Clears the global search term whenever the URL path or query changes. */
function useSearchResetOnNavigate() {
  const location = useLocation();
  const resetSearch = useSearchStore((s) => s.resetSearch);

  // Layout effect: clear before paint so the next page never flashes with the
  // previous page's filter for one frame.
  useLayoutEffect(() => {
    resetSearch();
  }, [location.pathname, location.search, resetSearch]);
}

export function AppRoutes() {
  useSearchResetOnNavigate();

  return (
    <Routes>
      <Route path="/" element={<HomeView />} />
      <Route path="/models" element={<RankingsHubView />} />
      <Route path="/releases" element={<ReleasesView />} />
      <Route path="/news" element={<NewsView />} />
      <Route path="/status" element={<StatusView />} />
      <Route path="/status/:source" element={<SourceDetailView />} />
      <Route path="/compare" element={<CompareView />} />
      <Route path="/price-compare" element={<PriceCompareView />} />
      <Route path="/model/:source/*" element={<ModelDetailView />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
