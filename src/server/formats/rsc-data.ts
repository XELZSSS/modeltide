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

export function findNextData<T>(root: unknown, key: string): T[] | null {
  if (!key || root === null || typeof root !== "object") return null;
  for (const node of traverse(root)) {
    const raw = (node as Record<string, unknown>)[key];
    if (Array.isArray(raw)) return raw as T[];
  }
  return null;
}

export function findLongestData<T>(root: unknown, key: string): T[] | null {
  if (!key || root === null || typeof root !== "object") return null;
  let best: T[] | null = null;
  for (const node of traverse(root)) {
    const raw = (node as Record<string, unknown>)[key];
    if (!Array.isArray(raw)) continue;
    if (!best || raw.length > best.length) best = raw as T[];
  }
  return best;
}
