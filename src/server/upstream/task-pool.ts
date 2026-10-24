export async function runCapped<T>(
  tasks: readonly (() => Promise<T>)[],
  concurrency: number,
): Promise<PromiseSettledResult<T>[]> {
  const results: PromiseSettledResult<T>[] = [];
  const total = tasks.length;
  let cursor = 0;
  const runner = async (): Promise<void> => {
    // `i` only ever advances to a value below `total`, which is `tasks.length`, so `tasks[i]` always exists.
    while (cursor < total) {
      const i = cursor;
      cursor += 1;
      try {
        results[i] = { status: "fulfilled", value: await tasks[i]!() };
      } catch (reason) {
        results[i] = { status: "rejected", reason };
      }
    }
  };
  const runnerCount = Math.max(1, Math.min(concurrency, total));
  const runners: Promise<void>[] = [];
  for (let i = 0; i < runnerCount; i++) runners.push(runner());
  await Promise.all(runners);
  return results;
}
