import type { TaskSlice } from "@/shared/types/app";

const TASK_SLICE_LIMIT = 5;

export const OTHER_TASK_KEY = "__other__";
export const UNTAGGED_TASK_KEY = "__untagged__";

/**
 * Aggregates the task histogram of an open-source model list into the slices the home doughnut draws.
 *
 * The server runs this over the full HF page and ships only the slices, so `/` never has to carry the thousand rows the
 * histogram was derived from. `total` counts every model, including the untagged and the aggregated tail, because it is
 * the denominator of each slice's share.
 */
export function aggregateTaskShare(models: readonly { task: string | null | undefined }[]): {
  slices: TaskSlice[];
  total: number;
} {
  const counts = new Map<string, number>();
  let untagged = 0;
  for (const model of models) {
    const task = typeof model.task === "string" ? model.task.trim() : "";
    if (!task) {
      untagged += 1;
      continue;
    }
    counts.set(task, (counts.get(task) ?? 0) + 1);
  }
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  let total = untagged;
  const slices: TaskSlice[] = ranked.slice(0, TASK_SLICE_LIMIT).map(([key, count]) => {
    total += count;
    return { key, total: count };
  });
  const tailTotal = ranked.slice(TASK_SLICE_LIMIT).reduce((sum, [, count]) => sum + count, 0);
  total += tailTotal;
  if (untagged > 0) slices.push({ key: UNTAGGED_TASK_KEY, total: untagged });
  if (tailTotal > 0) slices.push({ key: OTHER_TASK_KEY, total: tailTotal });
  return { slices, total };
}
