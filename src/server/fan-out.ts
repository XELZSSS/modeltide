import type { AppContext } from "./api/context";
import { errMsg, rethrowIfClientAbort } from "./api/errors";
import { runLegs, type Leg, type LegValues } from "./join-legs";

export interface FanOutOptions {
  tag: string;
  concurrency?: number;
  allFailedMessage?: string;
}

export interface FanOutFailure {
  label: string;
  reason: unknown;
}

export interface FanOutResult<L extends readonly Leg<unknown>[]> {
  values: LegValues<L>;
  failures: FanOutFailure[];
  partial: boolean;
  reasons: string;
}

export async function fanOut<L extends readonly Leg<unknown>[]>(
  ctx: AppContext,
  legs: readonly [...L],
  opts: FanOutOptions,
): Promise<FanOutResult<L>> {
  const { values, failures } = await runLegs(legs, {
    concurrency: opts.concurrency,
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
    reasons: failures.map((failure) => `${failure.label}: ${errMsg(failure.reason)}`).join("; "),
  };
}
