import { QueryClient } from "@tanstack/vue-query";
import { FIVE_MINUTES, THIRTY_MINUTES } from "@/shared/config";
import { ApiClientError, isAbortError } from "@/client/api/api-client";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (count, err) => {
        if (isAbortError(err)) return false;
        if (err instanceof ApiClientError) {
          const status = err.status;
          if (status >= 400 && status < 500 && status !== 429 && status !== 408) return false;
        }
        return count < 2;
      },
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 5000),
      refetchOnWindowFocus: true,
      staleTime: FIVE_MINUTES,
      gcTime: THIRTY_MINUTES,
    },
  },
});
