/** Navigation helpers for decoded RSC/Flight JSON trees. */

function* traverse(root: unknown): Generator<unknown> {
  const queue: unknown[] = [root];
  let head = 0;
  while (head < queue.length) {
    const cur = queue[head++]!;
    if (!cur || typeof cur !== "object") continue;
    yield cur;
    const children = Array.isArray(cur) ? cur : Object.values(cur as Record<string, unknown>);
    for (const v of children) {
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

// `key` is one of the caller's own marker constants, so only the tree is unvalidated: a falsy marker would match
// nothing, and returning `null` for it would hide a caller mistake behind a parse failure.
export function findNextData<T>(root: unknown, key: string): T[] | null {
  const first = dataArrays<T>(root, key).next();
  return first.done ? null : first.value;
}

export function findLongestData<T>(root: unknown, key: string): T[] | null {
  let best: T[] | null = null;
  for (const rows of dataArrays<T>(root, key)) {
    if (best === null || rows.length > best.length) best = rows;
  }
  return best;
}
