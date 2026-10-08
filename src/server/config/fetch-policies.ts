import {
  FAST_FETCH_OPTS,
  PROVIDER_STATUS_FETCH_OPTS,
  UPSTREAM_FETCH_OPTS,
} from "@/server/config/timeouts";

export type FetchPolicyName = "interactive" | "slowFeed" | "providerHealth" | "rsc";

const POLICIES = {
  interactive: UPSTREAM_FETCH_OPTS,
  slowFeed: FAST_FETCH_OPTS,
  providerHealth: PROVIDER_STATUS_FETCH_OPTS,
  rsc: UPSTREAM_FETCH_OPTS,
} as const;

export function fetchPolicy(name: FetchPolicyName): { timeoutMs: number; retries: number } {
  return { ...POLICIES[name] };
}
