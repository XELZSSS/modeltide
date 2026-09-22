import { StrictMode, Suspense, lazy, useEffect, type ComponentType, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { usePathname } from "@/client/router";
import { Providers, useTranslation } from "@/client/providers";
import { AppShell } from "@/client/components/layout/app-shell";
import { ErrorBoundary, NotFound, Spinner } from "@/client/components/feedback";
import { useSearchStore } from "@/client/stores";
import { registerServiceWorker, unregisterStaleServiceWorker } from "@/client/pwa/use-pwa";
import { HomeView } from "@/client/features/home/home-view";
import "@/styles/globals.css";

const RankingsHubView = lazy(() =>
  import("@/client/features/rankings/rankings-hub-view").then((m) => ({ default: m.RankingsHubView })),
);
const ModelDetailView = lazy(() =>
  import("@/client/features/models/model-view").then((m) => ({ default: m.ModelDetailView })),
);
const CompareView = lazy(() =>
  import("@/client/features/compare/compare-view").then((m) => ({ default: m.CompareView })),
);
const PriceCompareView = lazy(() =>
  import("@/client/features/compare/price-compare-view").then((m) => ({ default: m.PriceCompareView })),
);
const ReleasesView = lazy(() =>
  import("@/client/features/releases/releases-view").then((m) => ({ default: m.ReleasesView })),
);
const NewsView = lazy(() => import("@/client/features/news/news-view").then((m) => ({ default: m.NewsView })));
const StatusView = lazy(() => import("@/client/features/status/status-view").then((m) => ({ default: m.StatusView })));
const SourceDetailView = lazy(() =>
  import("@/client/features/status/source-view").then((m) => ({ default: m.SourceDetailView })),
);

function SearchResetOnNavigate(): null {
  const pathname = usePathname();
  const resetSearch = useSearchStore((s) => s.resetSearch);

  useEffect(() => {
    resetSearch();
  }, [pathname, resetSearch]);
  return null;
}

// ErrorBoundary is a class component, so the translated copy has to be read here,
// one level below the i18n provider that wraps <Routes />.
function ShellErrorBoundary({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <ErrorBoundary
      errorTitle={t("errorBoundaryTitle")}
      retryLabel={t("errorBoundaryRetry")}
      offlineMessage={t("offlineRetry")}
    >
      {children}
    </ErrorBoundary>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <AppShell>
      <ShellErrorBoundary>
        <Suspense fallback={<Spinner />}>{children}</Suspense>
      </ShellErrorBoundary>
    </AppShell>
  );
}

interface RouteEntry {
  key: string;
  match: (pathname: string) => boolean;
  el: ComponentType;
}

/** Order matters: exact paths first, then the two `/…/` prefix routes. */
const ROUTES: RouteEntry[] = [
  { key: "home", match: (p) => p === "/", el: HomeView },
  { key: "models", match: (p) => p === "/models", el: RankingsHubView },
  { key: "compare", match: (p) => p === "/compare", el: CompareView },
  { key: "price", match: (p) => p === "/price-compare", el: PriceCompareView },
  { key: "releases", match: (p) => p === "/releases", el: ReleasesView },
  { key: "news", match: (p) => p === "/news", el: NewsView },
  { key: "status", match: (p) => p === "/status", el: StatusView },
  { key: "model", match: (p) => p.startsWith("/model/"), el: ModelDetailView },
  { key: "source", match: (p) => p.startsWith("/status/"), el: SourceDetailView },
];

function Routes() {
  const pathname = usePathname();
  const route = ROUTES.find((r) => r.match(pathname));
  if (!route)
    return (
      <Shell>
        <NotFound />
      </Shell>
    );
  const View = route.el;
  return (
    <Shell key={route.key}>
      <View />
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
