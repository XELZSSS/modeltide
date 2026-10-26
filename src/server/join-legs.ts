import { rethrowIfAllAborted, UpstreamError } from "./api/errors";
import { runCapped } from "./upstream/task-pool";
import { UPSTREAM_MAX_CONNECTIONS } from "./upstream/timeouts";

/**
 * How many legs of one fan-out may be in flight at once: every leg is an upstream call, and the shared pool only lets
 * `UPSTREAM_MAX_CONNECTIONS` of them hold a connection, so a wider fan-out would queue inside the pool anyway. Sources
 * whose legs are themselves bulk fan-outs (news feeds) pass their own, smaller limit.
 */
const DEFAULT_LEG_CONCURRENCY = UPSTREAM_MAX_CONNECTIONS;

export interface Leg<T> {
  label: string;
  run: () => Promise<T>;
}

interface LegFailure {
  label: string;
  reason: unknown;
}

interface RunLegsOptions {
  concurrency?: number;
  onFailure?: (failure: LegFailure) => void;
  allFailedMessage?: string;
}

type LegValue<L> = L extends Leg<infer T> ? T : never;

export type LegValues<L extends readonly Leg<unknown>[]> = { [K in keyof L]: LegValue<L[K]> | undefined };

export async function runLegs<L extends readonly Leg<unknown>[]>(
  legs: readonly [...L],
  opts: RunLegsOptions = {},
): Promise<{ values: LegValues<L>; failures: LegFailure[] }> {
  const tasks = legs.map((leg) => leg.run);
  // Legs are upstream calls, and the shared pool only lets UPSTREAM_MAX_CONNECTIONS of them hold a connection at once:
  // anything past that queues inside the pool anyway, so the default cap is the pool's size rather than the leg count.
  // A source whose legs are themselves bulk fan-outs (news feeds) passes a smaller explicit `concurrency`.
  const settled = await runCapped(tasks, opts.concurrency ?? Math.min(tasks.length, DEFAULT_LEG_CONCURRENCY));

  const failures: LegFailure[] = [];
  settled.forEach((result, i) => {
    if (result.status !== "rejected") return;
    const failure: LegFailure = { label: legs[i]!.label, reason: result.reason };
    failures.push(failure);
    opts.onFailure?.(failure);
  });
  rethrowIfAllAborted(settled);

  // News is the one dynamic list: `rssFeeds[category].map(...)` with three feeds in every category (see feeds.ts), so a
  // zero-leg fan-out cannot arrive — which is also why `legs.length > 0` is not guarded here.
  if (opts.allFailedMessage != null && failures.length === legs.length) {
    throw new UpstreamError(opts.allFailedMessage, { retryable: true });
  }

  const values = settled.map((result) => (result.status === "fulfilled" ? result.value : undefined));
  return { values: values as unknown as LegValues<L>, failures };
}
