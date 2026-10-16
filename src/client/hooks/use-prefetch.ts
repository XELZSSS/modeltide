import { routePrefetchTarget } from "@/client/router";
import { usePrefetchIntent, type PrefetchIntent } from "./use-prefetch-intent";

export { usePrefetchIntent, type PrefetchIntent };

/** Hover/touch prefetch driven by the current route's declared targets. */
export function usePrefetch(): PrefetchIntent<string> {
  return usePrefetchIntent<string>(routePrefetchTarget);
}
