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
            results[j] = { status: "rejected", reason: new Error("Aborted") };
          }
        }
        return;
      }
      const i = cursor;
      cursor += 1;
      const task = tasks[i];
      if (!task) break;
      try {
        results[i] = { status: "fulfilled", value: await task() };
      } catch (reason) {
        results[i] = { status: "rejected", reason };
      }
    }
  };
  const workers = Math.max(1, Math.min(concurrency, total));
  await Promise.all(Array.from({ length: workers }, () => worker()));
  return results;
}

export const settled = <T>(r: PromiseSettledResult<T>, fallback: T): T =>
  r.status === "fulfilled" ? r.value : fallback;

export const errMsg = (e: unknown): string => (e instanceof Error ? e.message : String(e));

export const formatSettleErrors = (rs: readonly PromiseSettledResult<unknown>[], ls: readonly string[]): string =>
  rs
    .map((r, i) => (r.status === "rejected" ? `${ls[i] ?? i}: ${errMsg(r.reason)}` : null))
    .filter(Boolean)
    .join("; ");
