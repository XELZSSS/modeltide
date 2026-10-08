import type { Env } from "@/server/context";
import { buildContext } from "@/server/context";
import { SOURCES, type SourceEntry } from "@/server/sources/registry";
import type { ValidatedQuery, QuerySchema } from "@/server/infra/query-validation";

export function warmEntries(): SourceEntry[] {
  return SOURCES.filter((s) => s.warm === true);
}

export function warmTask(
  env: Env,
  entry: SourceEntry,
  taskTimeoutMs: number,
): () => Promise<unknown> {
  const params = {} as ValidatedQuery<QuerySchema>;
  return () => entry.handler(buildContext(env, { workSignal: AbortSignal.timeout(taskTimeoutMs) }), params);
}

export function buildWarmTasks(env: Env, taskTimeoutMs: number): (() => Promise<unknown>)[] {
  return warmEntries().map((entry) => warmTask(env, entry, taskTimeoutMs));
}
