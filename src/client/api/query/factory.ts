import { useQuery, type QueryClient, type UseQueryReturnType } from "@tanstack/vue-query";
import type { MaybeRefOrGetter } from "vue";
import { ONE_DAY, THIRTY_MINUTES, apiPaths, ttlFor } from "@/shared/config";
import type { ApiDomain, PayloadOf } from "@/shared/contract";
import type { SourcePayload } from "@/shared/types";
import { fetcher } from "../transport/client";
import { partialPollInterval } from "./partial-poll";

type RawPayload<D extends ApiDomain> = SourcePayload<PayloadOf<D>>;

const QUERY_DEFAULTS = {
  ttlMs: THIRTY_MINUTES,
  gcTimeMs: THIRTY_MINUTES,
  // A payload stays resident this many times its freshness, so returning to a page renders the cached copy instead of suspending.
  gcTimeMultiplier: 3,
  maxGcTimeMs: ONE_DAY,
} as const;

interface ApiQueryOptions<T> {
  ttl?: number;
  /** Staleness for a payload that arrived empty: the origin answers a miss with its shortest window (Hugging Face by-id
   * files "not found" for a minute), so an empty list kept for the full `ttl` hid a model that had just been indexed. */
  missTtlMs?: number;
  // Every caller registers the partial-poll pair together, so both are required.
  partialRefetchMs: number;
  isPartialData: (data: SourcePayload<T> | undefined) => boolean;
  query?: Record<string, string>;
}

export function createApiQuery<D extends ApiDomain>(
  domain: D,
  key: readonly (string | number)[],
  opts: ApiQueryOptions<PayloadOf<D>>,
) {
  const { ttl, missTtlMs, partialRefetchMs, isPartialData, query } = opts;
  const path = query ? `${apiPaths[domain]}?${new URLSearchParams(query)}` : apiPaths[domain];
  const queryFn = fetcher<PayloadOf<D>>(path);
  const ttlMs = ttl ?? QUERY_DEFAULTS.ttlMs;
  // A partial payload is stored under the shorter window `ttlFor` gives it (`src/server/pipeline.ts`), so the browser
  // holds it for that same window rather than the full domain TTL.
  const staleTimeFor = (payload: RawPayload<D> | undefined): number => {
    if (payload === undefined) return ttlMs;
    if (missTtlMs !== undefined && Array.isArray(payload.data) && payload.data.length === 0) return missTtlMs;
    return isPartialData(payload) ? ttlFor(true, ttlMs) : ttlMs;
  };
  const residentMs = Math.min(
    Math.max(ttlMs * QUERY_DEFAULTS.gcTimeMultiplier, QUERY_DEFAULTS.gcTimeMs),
    QUERY_DEFAULTS.maxGcTimeMs,
  );
  return {
    use: (enabled?: MaybeRefOrGetter<boolean>): UseQueryReturnType<RawPayload<D>, Error> =>
      useQuery<RawPayload<D>, Error>({
        queryKey: key,
        queryFn,
        refetchInterval: (q) => partialPollInterval(q, isPartialData as (data: unknown) => boolean, partialRefetchMs),
        staleTime: (query) => staleTimeFor(query.state.data),
        gcTime: residentMs,
        enabled,
      }),
    prefetch: (client: QueryClient) =>
      client.prefetchQuery({
        queryKey: key,
        queryFn,
        staleTime: (query) => staleTimeFor(query.state.data),
        gcTime: residentMs,
      }),
  };
}
