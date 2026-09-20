import { StrictMode, Suspense, lazy, useEffect, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { usePathname } from "@/client/router";
import { Providers } from "@/client/providers";
import { AppShell } from "@/client/components/layout/AppShell";
import { ErrorBoundary, NotFound, Spinner } from "@/client/components/feedback";
import { useSearchStore } from "@/client/stores";
import { registerServiceWorker, unregisterStaleServiceWorker } from "@/client/pwa/use-pwa";
import { HomeView } from "@/client/features/home/HomeView";
import "@/styles/globals.css";

const RankingsHubView = lazy(() =>
  import("@/client/features/rankings/RankingsHubView").then((m) => ({ default: m.RankingsHubView })),
);
const ModelDetailView = lazy(() =>
  import("@/client/features/models/ModelDetailView").then((m) => ({ default: m.ModelDetailView })),
);
const CompareView = lazy(() =>
  import("@/client/features/compare/CompareView.lazy").then((m) => ({ default: m.CompareView })),
);
const PriceCompareView = lazy(() =>
  import("@/client/features/compare/PriceCompareView.lazy").then((m) => ({ default: m.PriceCompareView })),
);
const ReleasesView = lazy(() =>
  import("@/client/features/releases/ReleasesView").then((m) => ({ default: m.ReleasesView })),
);
const NewsView = lazy(() => import("@/client/features/news/NewsView").then((m) => ({ default: m.NewsView })));
const StatusView = lazy(() => import("@/client/features/status/StatusView").then((m) => ({ default: m.StatusView })));
const SourceDetailView = lazy(() =>
  import("@/client/features/status/SourceDetailView").then((m) => ({ default: m.SourceDetailView })),
);

function SearchResetOnNavigate(): null {
  const pathname = usePathname();
  const resetSearch = useSearchStore((s) => s.resetSearch);

  useEffect(() => {
    resetSearch();
  }, [pathname, resetSearch]);
  return null;
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <AppShell>
      <ErrorBoundary>
        <Suspense fallback={<Spinner />}>{children}</Suspense>
      </ErrorBoundary>
    </AppShell>
  );
}

function Routes() {
  const pathname = usePathname();
  const route =
    pathname === "/"
      ? { el: <HomeView />, key: "home" }
      : pathname === "/models"
        ? { el: <RankingsHubView />, key: "models" }
        : pathname === "/compare"
          ? { el: <CompareView />, key: "compare" }
          : pathname === "/price-compare"
            ? { el: <PriceCompareView />, key: "price" }
            : pathname === "/releases"
              ? { el: <ReleasesView />, key: "releases" }
              : pathname === "/news"
                ? { el: <NewsView />, key: "news" }
                : pathname === "/status"
                  ? { el: <StatusView />, key: "status" }
                  : pathname.startsWith("/model/")
                    ? { el: <ModelDetailView />, key: "model" }
                    : pathname.startsWith("/status/")
                      ? { el: <SourceDetailView />, key: "source" }
                      : null;
  if (!route)
    return (
      <Shell>
        <NotFound />
      </Shell>
    );
  return <Shell key={route.key}>{route.el}</Shell>;
}

function App() {
  return (
    <StrictMode>
      <Providers>
        <Routes />
        <SearchResetOnNavigate />
      </Providers>
    </StrictMode>
  );
}

const root = document.getElementById("root");
if (!root) throw new Error("missing #root element");
createRoot(root).render(<App />);

const boot = () => {
  registerServiceWorker();
  unregisterStaleServiceWorker();
  if ("fonts" in document) {
    void document.fonts.load('400 1em "Inter Variable"');
    void document.fonts.load('600 1em "Inter Variable"');
    void document.fonts.load('400 1em "JetBrains Mono Variable"');
  }
};
const bootWhenLoaded = () => {
  if (document.readyState === "complete") boot();
  else window.addEventListener("load", boot, { once: true });
};
if (typeof requestIdleCallback === "function") {
  requestIdleCallback(bootWhenLoaded, { timeout: 2000 });
} else {
  bootWhenLoaded();
}
