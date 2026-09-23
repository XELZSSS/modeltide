import { rethrowIfAllAborted } from "@/server/infra/errors";
import { runCapped } from "@/server/infra/task-pool";

interface Leg<T> {
  label: string;
  run: () => Promise<T>;
}

export interface LegFailure {
  label: string;
  reason: unknown;
}

interface RunLegsOptions {
  concurrency?: number;
  signal?: AbortSignal;
  /** Runs per failed leg, in leg order, before an all-aborted round is rethrown. */
  onFailure?: (failure: LegFailure) => void;
}

type LegValue<L> = L extends Leg<infer T> ? T : never;

type LegValues<L extends readonly Leg<unknown>[]> = { [K in keyof L]: LegValue<L[K]> | undefined };

/** Every-leg-aborted rounds rethrow the caller's abort, not an upstream failure. */
export async function runLegs<L extends readonly Leg<unknown>[]>(
  legs: readonly [...L],
  opts: RunLegsOptions = {},
): Promise<{ values: LegValues<L>; failures: LegFailure[] }> {
  const tasks = legs.map((leg) => leg.run);
  const settled: PromiseSettledResult<unknown>[] =
    opts.concurrency != null || opts.signal != null
      ? await runCapped(tasks, opts.concurrency ?? tasks.length, opts.signal ? { signal: opts.signal } : undefined)
      : await Promise.allSettled(tasks.map((task) => task()));

  const failures: LegFailure[] = [];
  settled.forEach((result, i) => {
    if (result.status !== "rejected") return;
    const failure: LegFailure = { label: legs[i]?.label ?? String(i), reason: result.reason };
    failures.push(failure);
    opts.onFailure?.(failure);
  });
  rethrowIfAllAborted(settled);

  const values = settled.map((result) => (result.status === "fulfilled" ? result.value : undefined));
  return { values: values as unknown as LegValues<L>, failures };
}
