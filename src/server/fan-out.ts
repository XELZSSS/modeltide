import type { AppContext } from "./api/context";
import { errMsg, rethrowIfClientAbort } from "./api/errors";
import { runLegs, type Leg, type LegFailure, type LegValues } from "./join-legs";

/**
 * `tag` prefixes the per-leg failure logs and `allFailedMessage` is the one policy worth sharing between the two entry
 * points: sources decide for themselves what a *partial* result means, so the caller reads `failures` and decides.
 * `runLegs` caps width at the shared slot pool's connection limit, so this layer queues the legs rather than bounding them.
 */
interface FanOutOptions {
  tag: string;
  /** Thrown as a retryable 502 once every leg has rejected; omit it when the source can render from a subset. */
  allFailedMessage?: string;
}

interface FanOutResult<L extends readonly Leg<unknown>[]> {
  values: LegValues<L>;
  failures: LegFailure[];
}

export async function fanOut<L extends readonly Leg<unknown>[]>(
  ctx: AppContext,
  legs: readonly [...L],
  opts: FanOutOptions,
): Promise<FanOutResult<L>> {
  return runLegs(legs, {
    allFailedMessage: opts.allFailedMessage,
    onFailure: (failure) => {
      rethrowIfClientAbort(failure.reason);
      ctx.log("warn", `[${opts.tag}] ${failure.label} leg failed: ${errMsg(failure.reason)}`);
    },
  });
}
