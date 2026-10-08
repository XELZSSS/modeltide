import { buildContext, type Env } from "@/server/context";
import { recordStatusSamples } from "@/server/sources/status";
import { warmTasks } from "@/server/sources/registry";
import { runCapped, TaskNotRunError } from "@/server/infra/task-pool";
import {
  SAMPLE_TIMEOUT_MS,
  WARM_TASK_TIMEOUT_MS,
  WARM_CONCURRENCY,
  warmBatchTimeoutMs,
} from "@/server/config";
import { errMsg } from "@/shared/utils";
import { isPartialPayload } from "@/shared/types/payload";
import { logger } from "@/server/infra/logger";

export interface ScheduledResult {
  sampled: boolean | null;
  warmFailed: number;
  warmTotal: number;
  healthy: boolean;
}

export function warmRoundOutcome(results: readonly PromiseSettledResult<unknown>[]): {
  notRun: number;
  failed: number;
  degraded: number;
  total: number;
} {
  const notRun = results.filter((r) => r.status === "rejected" && r.reason instanceof TaskNotRunError).length;
  const failed = results.filter((r) => r.status === "rejected").length - notRun;
  const degraded = results.filter((r) => r.status === "fulfilled" && isPartialPayload(r.value)).length;
  return { notRun, failed, degraded, total: results.length };
}

export function cronHealthy(sampled: boolean | null, warmFailed: number, warmTotal: number): boolean {
  return sampled !== false && warmTotal > 0 && warmFailed === 0;
}

export async function scheduledTask(
  env: Env,
  deps: {
    recordSamples?: typeof recordStatusSamples;
    buildTasks?: typeof warmTasks;
    run?: typeof runCapped;
  } = {},
): Promise<ScheduledResult> {
  const recordSamples = deps.recordSamples ?? recordStatusSamples;
  const buildTasks = deps.buildTasks ?? warmTasks;
  const run = deps.run ?? runCapped;

  const runSampling = async (): Promise<boolean | null> => {
    try {
      return await recordSamples(buildContext(env, { workSignal: AbortSignal.timeout(SAMPLE_TIMEOUT_MS) }));
    } catch (err) {
      logger("warn", `[status-history] sampling failed: ${errMsg(err)}`);
      return false;
    }
  };
  const runWarmup = async (): Promise<{ failed: number; total: number }> => {
    try {
      const tasks = buildTasks(env, WARM_TASK_TIMEOUT_MS);
      const batchSignal = AbortSignal.timeout(warmBatchTimeoutMs(tasks.length));
      const results = await run(tasks, WARM_CONCURRENCY, { signal: batchSignal });
      const { notRun, failed, degraded, total } = warmRoundOutcome(results);
      if (notRun > 0) logger("warn", `[warm] ${notRun}/${total} warmup calls never ran before the deadline`);
      if (failed > 0) logger("warn", `[warm] ${failed}/${total} warmup calls failed`);
      if (degraded > 0) logger("warn", `[warm] ${degraded}/${total} warmup calls cached a partial payload`);
      return { failed: failed + notRun, total };
    } catch (err) {
      logger("warn", `[warm] warmup failed: ${errMsg(err)}`);
      return { failed: 1, total: 1 };
    }
  };
  // Sequential, not parallel: parallel rounds would contend for the 6 connections and burst the subrequest budget.
  const sampled = await runSampling();
  const warm = await runWarmup();
  return {
    sampled,
    warmFailed: warm.failed,
    warmTotal: warm.total,
    healthy: cronHealthy(sampled, warm.failed, warm.total),
  };
}
