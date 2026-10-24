import type { Query } from "@tanstack/query-core";
import { useQuery, type QueryClient, type UseQueryReturnType } from "@tanstack/vue-query";
import type { MaybeRefOrGetter } from "vue";
import { ONE_DAY, THIRTY_MINUTES, apiPaths } from "@/shared/config";
import type { ApiDomain, PayloadOf } from "@/shared/contract";
import type { SourcePayload } from "@/shared/types";
import { fetcher } from "./api-client";
import { partialPollInterval } from "./partial-poll";

type RawPayload<D extends ApiDomain> = SourcePayload<PayloadOf<D>>;

type PollFn<D extends ApiDomain> = (
  query: Query<RawPayload<D>, Error, RawPayload<D>, readonly unknown[]>,
) => number | false;

const QUERY_DEFAULTS = {
  ttlMs: THIRTY_MINUTES,
  gcTimeMs: THIRTY_MINUTES,
  // A payload stays resident this many times its freshness. With `gcTime === staleTime` the entry was dropped the
  // moment it went stale, so a return to the page suspended on an empty plate instead of rendering the copy it had.
  gcTimeMultiplier: 3,
  maxGcTimeMs: ONE_DAY,
} as const;

interface ApiQueryOptions<T> {
  ttl?: number;
  gcTime?: number;
  // Every caller in `catalog.ts` registers the partial-poll pair together, so both are required: the "this query never
  // polls" arm they used to feed is unreachable.
  partialRefetchMs: number;
  isPartialData: (data: SourcePayload<T> | undefined) => boolean;
  query?: Record<string, string>;
}

// `opts` is required: all six `createApiQuery` calls in `catalog.ts` pass it, so the `?? {}` arm had no caller.
export function createApiQuery<D extends ApiDomain>(
  domain: D,
  key: readonly (string | number)[],
  opts: ApiQueryOptions<PayloadOf<D>>,
) {
  const { ttl, gcTime, partialRefetchMs, isPartialData, query } = opts;
  const path = query ? `${apiPaths[domain]}?${new URLSearchParams(query)}` : apiPaths[domain];
  const queryFn = fetcher<PayloadOf<D>>(path);
  const ttlMs = ttl ?? QUERY_DEFAULTS.ttlMs;
  const residentMs = Math.min(
    Math.max(ttlMs * QUERY_DEFAULTS.gcTimeMultiplier, QUERY_DEFAULTS.gcTimeMs),
    QUERY_DEFAULTS.maxGcTimeMs,
  );
  const refetchInterval: PollFn<D> = (q) =>
    partialPollInterval(q, isPartialData as (data: unknown) => boolean, partialRefetchMs);
  const timing = {
    gcTime: gcTime ?? residentMs,
    refetchInterval,
    staleTime: ttlMs,
  };
  const use = (enabled?: MaybeRefOrGetter<boolean>): UseQueryReturnType<RawPayload<D>, Error> =>
    useQuery<RawPayload<D>, Error>({ queryKey: key, queryFn, ...timing, enabled });
  return {
    domain,
    key,
    queryFn,
    use,
    prefetch: (client: QueryClient) =>
      client.prefetchQuery({ queryKey: key, queryFn, staleTime: timing.staleTime, gcTime: timing.gcTime }),
  };
}
