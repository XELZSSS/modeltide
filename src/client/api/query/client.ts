import { QueryClient } from "@tanstack/vue-query";
import { ApiClientError, isAbortError } from "../transport/client";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (count, err) => {
        if (isAbortError(err)) return false;
        if (err instanceof ApiClientError) {
          // A rate limit is the one failure not worth retrying: the server just said when to come back, and the two
          // quick retries below would land inside that window while the reader is shown the same wait.
          if (err.kind === "rate-limited" || err.retryAfterS !== undefined) return false;
          const { status } = err;
          if (status !== undefined && status >= 400 && status < 500 && status !== 429 && status !== 408) return false;
        }
        return count < 2;
      },
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 5000),
      refetchOnWindowFocus: true,
      // `staleTime` and `gcTime` have no default here: `createApiQuery` is the only creator of queries and always
      // passes both, so a value set on this object would never be read.
    },
  },
});
