import { routePrefetchTarget } from "@/client/router";
import { usePrefetchIntent, type PrefetchIntent } from "./use-prefetch-intent";

export { usePrefetchIntent };

export function usePrefetch(): PrefetchIntent<string> {
  return usePrefetchIntent<string>(routePrefetchTarget);
}
