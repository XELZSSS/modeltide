import { routePrefetchTarget } from "@/client/router/prefetch";
import { usePrefetchIntent, type PrefetchIntent } from "./use-prefetch-intent";

export { usePrefetchIntent, type PrefetchIntent };
export { prefetchQueries, preloadChunk, routePrefetchTarget, type PrefetchTarget } from "@/client/router/prefetch";

/** Hover/touch prefetch driven by the current route's declared targets. */
export function usePrefetch(): PrefetchIntent<string> {
  return usePrefetchIntent<string>(routePrefetchTarget);
}
