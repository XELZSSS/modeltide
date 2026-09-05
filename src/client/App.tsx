import { Suspense } from "react";
import { BrowserRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { I18nProvider, DeviceProvider } from "@/client/providers";
import { AppShell } from "@/client/components/layout";
import { ErrorBoundary, Spinner } from "@/client/components/shared";
import { AppRoutes } from "@/client/routes";
import { FIVE_MINUTES, STATIC_TTL_MS } from "@/shared/config";
import { ApiClientError } from "@/client/api/queries";

// Retry transient failures only; 4xx (except 429) never retries. No refetch on
// focus; data fresh for 5 min. gcTime covers the longest static TTL (6h).
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (count, err) => {
        if (err instanceof ApiClientError && err.status >= 400 && err.status < 500 && err.status !== 429) {
          return false;
        }
        return count < 2;
      },
      refetchOnWindowFocus: false,
      staleTime: FIVE_MINUTES,
      gcTime: STATIC_TTL_MS,
    },
  },
});

/** Root component wiring providers and router. */
export function App() {
  return (
    <I18nProvider>
      <DeviceProvider>
        <QueryClientProvider client={queryClient}>
          <BrowserRouter>
            <AppShell>
              {/* Lazy-chunk failures would otherwise white-screen. */}
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
