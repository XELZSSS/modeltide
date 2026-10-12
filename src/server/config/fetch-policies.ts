import { FAST_FETCH_OPTS, UPSTREAM_FETCH_OPTS } from "@/server/config/timeouts";

export type FetchPolicyName = "interactive" | "slowFeed" | "rsc";

const POLICIES = {
  interactive: UPSTREAM_FETCH_OPTS,
  slowFeed: FAST_FETCH_OPTS,
  rsc: { timeoutMs: 12_000, retries: 1 },
} as const;

export function fetchPolicy(name: FetchPolicyName): { timeoutMs: number; retries: number } {
  return { ...POLICIES[name] };
}
