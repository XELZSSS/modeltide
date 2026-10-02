import type { Query } from "@tanstack/query-core";
import { useQuery, type QueryClient, type UseQueryReturnType } from "@tanstack/vue-query";
import type { MaybeRefOrGetter } from "vue";
import { STATIC_TTL_MS, THIRTY_MINUTES, apiPaths } from "@/shared/config";
import type { ApiDomain, PayloadOf } from "@/shared/contract";
import type { SourcePayload } from "@/shared/types";
import { fetcher } from "@/client/api/api-client";
import { partialPollInterval } from "./partial-poll";

export type RawPayload<D extends ApiDomain> = SourcePayload<PayloadOf<D>>;

export type QueryResult<D extends ApiDomain> = UseQueryReturnType<RawPayload<D>, Error>;

type PollFn<D extends ApiDomain> = (
  query: Query<RawPayload<D>, Error, RawPayload<D>, readonly unknown[]>,
) => number | false;

interface ApiQueryOptions<T> {
  ttl?: number;
  gcTime?: number;
  partialRefetchMs?: number;
  refetchMs?: number;
  isPartialData?: (data: SourcePayload<T> | undefined) => boolean;
  query?: Record<string, string>;
}

export function createApiQuery<D extends ApiDomain>(
  domain: D,
  key: readonly (string | number)[],
  opts?: ApiQueryOptions<PayloadOf<D>>,
) {
  const { ttl, gcTime, partialRefetchMs, refetchMs, isPartialData, query } = opts ?? {};
  const path = query ? `${apiPaths[domain]}?${new URLSearchParams(query)}` : apiPaths[domain];
  const queryFn = fetcher<PayloadOf<D>>(path);
  const ttlMs = ttl ?? THIRTY_MINUTES;
  const refetchInterval: number | false | PollFn<D> =
    isPartialData != null && partialRefetchMs != null
      ? (query) => partialPollInterval(query, isPartialData as (data: unknown) => boolean, partialRefetchMs)
      : (refetchMs ?? false);
  const timing = {
    gcTime: gcTime ?? Math.min(Math.max(ttlMs, THIRTY_MINUTES), STATIC_TTL_MS),
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
