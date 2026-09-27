import { router } from "@/client/router";
import { queryClient } from "@/client/api/query-client";

export function prefetchQueriesForRoute(path: string): void {
  const queries = router.resolve(path).matched.at(-1)?.meta.prefetch;
  for (const query of queries ?? []) void query.prefetch(queryClient);
}

export function loadRouteChunk(path: string): void {
  const load = router.resolve(path).matched.at(-1)?.meta.load;
  if (load) void load();
}
