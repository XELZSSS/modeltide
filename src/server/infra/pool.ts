export async function runCapped<T>(
  tasks: readonly (() => Promise<T>)[],
  concurrency: number,
): Promise<PromiseSettledResult<T>[]> {
  const results: PromiseSettledResult<T>[] = [];
  const total = tasks.length;
  let cursor = 0;
  const worker = async (): Promise<void> => {
    while (cursor < total) {
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
