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

  // Pathname only: ?tab= switches (replaceState) must preserve the table filter.
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

/** Route table: a lazy view (or NotFound) per client-side path. */
function Routes() {
  const pathname = usePathname();
  if (pathname === "/")
    return (
      <Shell>
        <HomeView />
      </Shell>
    );
  if (pathname === "/models")
    return (
      <Shell>
        <RankingsHubView />
      </Shell>
    );
  if (pathname === "/compare")
    return (
      <Shell>
        <CompareView />
      </Shell>
    );
  if (pathname === "/price-compare")
    return (
      <Shell>
        <PriceCompareView />
      </Shell>
    );
  if (pathname === "/releases")
    return (
      <Shell>
        <ReleasesView />
      </Shell>
    );
  if (pathname === "/news")
    return (
      <Shell>
        <NewsView />
      </Shell>
    );
  if (pathname === "/status")
    return (
      <Shell>
        <StatusView />
      </Shell>
    );
  if (pathname.startsWith("/model/"))
    return (
      <Shell>
        <ModelDetailView />
      </Shell>
    );
  if (pathname.startsWith("/status/"))
    return (
      <Shell>
        <SourceDetailView />
      </Shell>
    );
  return (
    <Shell>
      <NotFound />
    </Shell>
  );
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

// Idle-time boot tasks formerly in ClientBoot: service worker + font preload.
const boot = () => {
  registerServiceWorker();
  unregisterStaleServiceWorker();
  if ("fonts" in document) {
    void document.fonts.load('400 1em "Inter Variable"');
    void document.fonts.load('600 1em "Inter Variable"');
    void document.fonts.load('400 1em "JetBrains Mono Variable"');
  }
};
// requestIdleCallback may fire after `load` has already fired (busy main
// thread); gate on readyState so boot is never attached to a fired event.
const bootWhenLoaded = () => {
  if (document.readyState === "complete") boot();
  else window.addEventListener("load", boot, { once: true });
};
if (typeof requestIdleCallback === "function") {
  requestIdleCallback(bootWhenLoaded, { timeout: 2000 });
} else {
  bootWhenLoaded();
}
