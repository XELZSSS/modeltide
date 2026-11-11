import { rethrowIfAllAborted, UpstreamError } from "./api/errors";
import { runCapped } from "./upstream/task-pool";
import { UPSTREAM_MAX_CONNECTIONS } from "./upstream/timeouts";

/** How many legs of one fan-out may be in flight at once: the shared pool only lets `UPSTREAM_MAX_CONNECTIONS` of them hold a connection, so a wider fan-out would queue inside the pool anyway. */
const DEFAULT_LEG_CONCURRENCY = UPSTREAM_MAX_CONNECTIONS;

export interface Leg<T> {
  label: string;
  run: () => Promise<T>;
}

export interface LegFailure {
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
  const settled = await runCapped(tasks, opts.concurrency ?? Math.min(tasks.length, DEFAULT_LEG_CONCURRENCY));

  const failures: LegFailure[] = [];
  settled.forEach((result, i) => {
    if (result.status !== "rejected") return;
    const failure: LegFailure = { label: legs[i]!.label, reason: result.reason };
    failures.push(failure);
    opts.onFailure?.(failure);
  });
  rethrowIfAllAborted(settled);

  // News is the one dynamic list: three feeds in every category, so a zero-leg fan-out cannot arrive.
  if (opts.allFailedMessage != null && failures.length === legs.length) {
    throw new UpstreamError(opts.allFailedMessage, { retryable: true });
  }

  const values = settled.map((result) => (result.status === "fulfilled" ? result.value : undefined));
  return { values: values as unknown as LegValues<L>, failures };
}
