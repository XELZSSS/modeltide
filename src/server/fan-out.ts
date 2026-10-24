import type { AppContext } from "./api/context";
import { errMsg, rethrowIfClientAbort } from "./api/errors";
import { runLegs, type Leg, type LegValues } from "./join-legs";

/**
 * `tag` prefixes the per-leg failure logs and `allFailedMessage` is the one policy worth sharing between the two entry
 * points: sources still decide for themselves what a *partial* result means, because "some legs down" differs per
 * source — the AA index needs its leaderboard leg specifically, the home dashboard needs any one of its four.
 *
 * `runLegs` caps the width at the shared slot pool's six connections, so this layer queues the legs rather than
 * bounding them.
 */
interface FanOutOptions {
  tag: string;
  /** Thrown as a retryable 502 once every leg has rejected; omit it when the source can render from a subset. */
  allFailedMessage?: string;
}

interface FanOutFailure {
  label: string;
  reason: unknown;
}

interface FanOutResult<L extends readonly Leg<unknown>[]> {
  values: LegValues<L>;
  failures: FanOutFailure[];
  partial: boolean;
}

export async function fanOut<L extends readonly Leg<unknown>[]>(
  ctx: AppContext,
  legs: readonly [...L],
  opts: FanOutOptions,
): Promise<FanOutResult<L>> {
  const { values, failures } = await runLegs(legs, {
    allFailedMessage: opts.allFailedMessage,
    onFailure: (failure) => {
      rethrowIfClientAbort(failure.reason);
      ctx.log("warn", `[${opts.tag}] ${failure.label} leg failed: ${errMsg(failure.reason)}`);
    },
  });
  return {
    values,
    failures,
    partial: failures.length > 0,
  };
}
