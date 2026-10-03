import { queryClient } from "@/client/api/query-client";
import { router } from "@/client/router";
import type { Prefetchable } from "@/client/config/route-meta";

export interface PrefetchTarget {
  queries?: readonly Prefetchable[];
  load?: () => Promise<unknown>;
}

export function prefetchQueries(queries: readonly Prefetchable[]): void {
  for (const query of queries) void query.prefetch(queryClient);
}

export function preloadChunk(load: (() => Promise<unknown>) | undefined): void {
  if (load) void load().then(undefined, () => {});
}

export function routePrefetchTarget(path: string): PrefetchTarget {
  const meta = router.resolve(path).matched.at(-1)?.meta;
  return { queries: meta?.prefetch, load: meta?.load };
}
