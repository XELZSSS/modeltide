import { Suspense } from "react";
import { BrowserRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { I18nProvider, DeviceProvider } from "@/client/providers";
import { AppShell } from "@/client/components/layout";
import { ErrorBoundary, Spinner } from "@/client/components/shared";
import { AppRoutes } from "@/client/routes";
import { FIVE_MINUTES, THIRTY_MINUTES } from "@/shared/config";

// Retry transient failures but avoid background refetches on tab focus; API data is treated as fresh for 5 min.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 2, refetchOnWindowFocus: false, staleTime: FIVE_MINUTES, gcTime: THIRTY_MINUTES },
  },
});

/** Root component wiring i18n, device, react-query, and router providers. */
export function App() {
  return (
    <I18nProvider>
      <DeviceProvider>
        <QueryClientProvider client={queryClient}>
          <BrowserRouter>
            <AppShell>
              {/* Route-level boundary: lazy() chunk failures would otherwise white-screen. */}
              <ErrorBoundary>
                <Suspense fallback={<Spinner />}>
                  <AppRoutes />
                </Suspense>
              </ErrorBoundary>
            </AppShell>
          </BrowserRouter>
        </QueryClientProvider>
      </DeviceProvider>
    </I18nProvider>
  );
}
