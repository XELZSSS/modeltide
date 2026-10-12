export {
  usePrefetchIntent,
  type PrefetchIntent,
} from "./use-prefetch-intent";
export { prefetchQueries, preloadChunk, routePrefetchTarget, type PrefetchTarget } from "@/client/router/prefetch";
export { usePrefetchIntent as useTabPrefetch } from "./use-prefetch-intent";

import { routePrefetchTarget } from "@/client/router/prefetch";
import { usePrefetchIntent, type PrefetchIntent } from "./use-prefetch-intent";

export function useRoutePrefetch(): PrefetchIntent<string> {
  return usePrefetchIntent<string>(routePrefetchTarget);
}

export function usePrefetch(): PrefetchIntent<string> {
  return useRoutePrefetch();
}
