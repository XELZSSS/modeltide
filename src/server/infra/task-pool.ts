import { runAbortable } from "@/server/infra/abort";

export class TaskNotRunError extends Error {
  constructor() {
    super("Pool deadline passed before the task started");
    this.name = "TaskNotRunError";
  }
}

export async function runCapped<T>(
  tasks: readonly (() => Promise<T>)[],
  concurrency: number,
  opts?: { signal?: AbortSignal },
): Promise<PromiseSettledResult<T>[]> {
  const results: PromiseSettledResult<T>[] = [];
  const total = tasks.length;
  let cursor = 0;
  const worker = async (): Promise<void> => {
    while (cursor < total) {
      if (opts?.signal?.aborted) {
        while (cursor < total) {
          const j = cursor;
          cursor += 1;
          if (results[j] === undefined) {
            results[j] = { status: "rejected", reason: new TaskNotRunError() };
          }
        }
        return;
      }
      const i = cursor;
      cursor += 1;
      const task = tasks[i];
      if (!task) {
        results[i] = { status: "rejected", reason: new TaskNotRunError() };
        continue;
      }
      try {
        results[i] = { status: "fulfilled", value: await runAbortable(task, opts?.signal) };
      } catch (reason) {
        results[i] = { status: "rejected", reason };
      }
    }
  };
  const workers = Math.max(1, Math.min(concurrency, total));
  await Promise.all(Array.from({ length: workers }, () => worker()));
  return results;
}

export const errMsg = (e: unknown): string => (e instanceof Error ? e.message : String(e));
