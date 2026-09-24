import { StrictMode, Suspense, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { usePathname } from "@/client/router";
import { Providers, useTranslation } from "@/client/providers";
import { AppShell } from "@/client/components/layout";
import { NotFound, Spinner } from "@/client/components/feedback";
import { QueryResetErrorBoundary } from "@/client/router/suspense-query";
import { useDocumentMeta } from "@/client/router/document-meta";
import { registerServiceWorker, unregisterStaleServiceWorker } from "@/client/pwa/use-pwa";
import { findRoute } from "@/client/config/routes";
import "@/styles/globals.css";

function ShellErrorBoundary({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <QueryResetErrorBoundary
      errorTitle={t("errorBoundaryTitle")}
      retryLabel={t("errorBoundaryRetry")}
      offlineMessage={t("offlineRetry")}
    >
      {children}
    </QueryResetErrorBoundary>
  );
}

function Shell({ resetKey, children }: { resetKey?: string; children: ReactNode }) {
  return (
    <AppShell>
      <ShellErrorBoundary key={resetKey}>
        <Suspense fallback={<Spinner />}>{children}</Suspense>
      </ShellErrorBoundary>
    </AppShell>
  );
}

function Routes() {
  const pathname = usePathname();
  useDocumentMeta(pathname);
  const route = findRoute(pathname);
  if (!route)
    return (
      <Shell>
        <NotFound />
      </Shell>
    );
  const View = route.View;
  return (
    <Shell resetKey={route.key}>
      <View />
    </Shell>
  );
}

function App() {
  return (
    <StrictMode>
      <Providers>
        <Routes />
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
  if (findRoute(window.location.pathname)?.key === "home") void import("@/client/utils/charts-register");
  if ("fonts" in document) {
    void document.fonts.load('400 1em "IBM Plex Sans"');
    void document.fonts.load('600 1em "IBM Plex Sans"');
    void document.fonts.load('400 1em "IBM Plex Mono"');
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
