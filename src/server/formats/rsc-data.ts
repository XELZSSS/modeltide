/** Navigation helpers for decoded RSC/Flight JSON trees. */

function* traverse(root: unknown): Generator<unknown> {
  const queue: unknown[] = [root];
  let head = 0;
  while (head < queue.length) {
    const cur = queue[head]!;
    // The slot is emptied as it is consumed: a breadth-first walk holds every node it has already visited until the
    // walk ends, so on a multi-megabyte AA body the queue was a second copy of the whole tree.
    queue[head++] = null;
    if (!cur || typeof cur !== "object") continue;
    yield cur;
    if (Array.isArray(cur)) {
      for (const v of cur) {
        if (v !== null && typeof v === "object") queue.push(v);
      }
      continue;
    }
    // Spreading the values would allocate one array per node — tens of thousands on a leaderboard body — each walked
    // once and thrown away; `for in` reads the own keys of a parsed object with no allocation at all.
    for (const k in cur) {
      const v = (cur as Record<string, unknown>)[k];
      if (v !== null && typeof v === "object") queue.push(v);
    }
  }
}

/** Every array stored under `key`, in the order `traverse` reaches it. */
function* dataArrays<T>(root: unknown, key: string): Generator<T[]> {
  for (const node of traverse(root)) {
    const raw = (node as Record<string, unknown>)[key];
    if (Array.isArray(raw)) yield raw as T[];
  }
}

/**
 * The longest array filed under `key` whose rows the caller recognizes.
 *
 * `accept` is the page's own row shape, tested on a candidate array's first row: the Flight props that carry the model
 * matrix also carry the page's legend and changelog snapshots, and those sit beside it as shorter arrays. A caller
 * without a row shape to recognize omits `accept` and simply gets the longest array under the marker.
 */
export function findLongestData<T>(root: unknown, key: string, accept?: (row: T) => boolean): T[] | null {
  let best: T[] | null = null;
  for (const rows of dataArrays<T>(root, key)) {
    const first = rows[0];
    if (first === undefined) continue;
    if (accept !== undefined && !accept(first)) continue;
    if (best === null || rows.length > best.length) best = rows;
  }
  return best;
}
