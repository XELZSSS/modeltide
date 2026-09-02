import { lazy } from "react";
import { Route, Routes } from "react-router";
import { useSearchResetOnNavigate } from "@/client/hooks";
import { NotFound } from "@/client/components/shared";

// Route-level lazy() imports split each view into its own chunk, loaded on first navigation.
const HomeView = lazy(() => import("./features/home/HomeView").then((m) => ({ default: m.HomeView })));
const RankingsHubView = lazy(() =>
  import("./features/rankings/RankingsHubView").then((m) => ({ default: m.RankingsHubView })),
);
const ReleasesView = lazy(() => import("./features/releases/ReleasesView").then((m) => ({ default: m.ReleasesView })));
// Separate entry modules so /compare and /price-compare load independent chunks
// on first navigation instead of sharing one (two lazy() of the same module
// would be deduped by the bundler into a single chunk).
const CompareView = lazy(() => import("./features/compare/CompareView.lazy").then((m) => ({ default: m.CompareView })));
const PriceCompareView = lazy(() =>
  import("./features/compare/PriceCompareView.lazy").then((m) => ({ default: m.PriceCompareView })),
);
const NewsView = lazy(() => import("./features/news/NewsView").then((m) => ({ default: m.NewsView })));
const ModelDetailView = lazy(() =>
  import("./features/models/ModelDetailView").then((m) => ({ default: m.ModelDetailView })),
);
const StatusView = lazy(() => import("./features/status/StatusView").then((m) => ({ default: m.StatusView })));
const SourceDetailView = lazy(() =>
  import("./features/status/SourceDetailView").then((m) => ({ default: m.SourceDetailView })),
);

export function AppRoutes() {
  // Clear the global search term whenever the user navigates between routes.
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
