// Per-leg fan-out caps for upstream fetches. 2 + 2 = 4 in-flight fetches: the
// background pool's slot cap, which only interactive traffic can shrink.
export const PROBE_CONCURRENCY = 2;
export const PROVIDER_CONCURRENCY = 2;
export const NEWS_LEG_CONCURRENCY = 2;
