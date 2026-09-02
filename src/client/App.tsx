import { Suspense } from "react";
import { BrowserRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { I18nProvider, DeviceProvider } from "@/client/providers";
import { AppShell } from "@/client/components/layout";
import { ErrorBoundary, Spinner } from "@/client/components/feedback";
import { AppRoutes } from "@/client/routes";
import { FIVE_MINUTES, THIRTY_MINUTES } from "@/shared/config";
import { ApiClientError } from "@/client/api/queries";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (count, err) => {
        if (err instanceof ApiClientError && err.status >= 400 && err.status < 500 && err.status !== 429) {
          return false;
        }
        return count < 2;
      },
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 5000),
      refetchOnWindowFocus: false,
      staleTime: FIVE_MINUTES,
      gcTime: THIRTY_MINUTES,
    },
  },
});

export function App() {
  return (
    <I18nProvider>
      <DeviceProvider>
        <QueryClientProvider client={queryClient}>
          <BrowserRouter>
            <AppShell>
              {}
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
