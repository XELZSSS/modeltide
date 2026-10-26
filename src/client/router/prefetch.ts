import { queryClient } from "@/client/api/query/client";
import type { Prefetchable } from "./route-meta";

export interface PrefetchTarget {
  queries?: readonly Prefetchable[];
  load?: () => Promise<unknown>;
}

export function prefetchQueries(queries: readonly Prefetchable[]): void {
  for (const query of queries) void query.prefetch(queryClient);
}
