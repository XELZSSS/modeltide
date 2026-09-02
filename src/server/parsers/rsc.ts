import { UpstreamError } from "@/server/infra/errors";

const MAX_RSC_BYTES = 5 * 1024 * 1024;

function* traverse(root: unknown): Generator<unknown> {
  const stack: unknown[] = [root];
  while (stack.length) {
    const cur = stack.pop();
    if (!cur || typeof cur !== "object") continue;
    yield cur;
    const children = Array.isArray(cur) ? cur : Object.values(cur as Record<string, unknown>);
    for (const v of children) if (v !== null && typeof v === "object") stack.push(v);
  }
}

function findInTree<T>(root: unknown, pred: (n: unknown) => T | null): T | null {
  for (const node of traverse(root)) {
    const hit = pred(node);
    if (hit) return hit;
  }
  return null;
}

export function findNextData<T>(root: unknown, key: string): T[] | null {
  return findInTree<T[]>(root, (n) => {
    const r = (n as Record<string, unknown>)[key];
    return Array.isArray(r) ? (r as T[]) : null;
  });
}

/**
 * Finds the largest array in the tree whose items match: upstream spreads one
 * logical list across several payload chunks, so the longest fragment wins.
 */
export function findArrayInTree<T>(root: unknown, matches: (item: unknown) => boolean): T[] | null {
  let best: T[] | null = null;
  for (const node of traverse(root)) {
    if (Array.isArray(node) && node.some(matches) && (!best || node.length > best.length)) best = node as T[];
  }
  return best;
}

function isMarkerBoundary(line: string, marker: string): boolean {
  const q = `"${marker}"`;
  let idx = line.indexOf(q);
  while (idx !== -1) {
    const after = line.slice(idx + q.length);
    const trimmed = after.trimStart();
    if (!trimmed) return after.length !== 0;
    const c = trimmed[0]!;
    if (c === ":" || c === "[" || c === '"' || c === "," || c === "}" || c === "]") return true;
    idx = line.indexOf(q, idx + 1);
  }
  return false;
}

// Next.js flight chunk ids are hex (e.g. `26:`, `c:`, `2e:`) but typically
// lowercase; match any hex run so letters like `c:` are not dropped.
const STREAM_LINE_RE = /^[0-9a-f]+:(.*)$/;

function tryParseCandidates<T>(line: string, extract: (data: unknown) => T[] | null): T[] | null {
  const prefixed = STREAM_LINE_RE.exec(line)?.[1];
  for (const raw of [prefixed, line]) {
    if (!raw || raw.length > MAX_RSC_BYTES) continue;
    try {
      const tree = JSON.parse(raw);
      const res = extract(tree);
      if (res && res.length > 0) return res;
    } catch {
      // Not valid JSON for this line — try next candidate
    }
  }
  return null;
}

export function parseRscPayload<T>(body: string, marker: string, extract: (data: unknown) => T[] | null): T[] {
  if (body.length > MAX_RSC_BYTES)
    throw new UpstreamError(`RSC body too large (${body.length} bytes, limit ${MAX_RSC_BYTES})`);
  for (const line of body.split(/\r?\n/)) {
    if (!isMarkerBoundary(line, marker)) continue;
    const res = tryParseCandidates(line, extract);
    if (res) return res;
  }
  throw new UpstreamError(`RSC marker "${marker}" not found or payload empty. body length=${body.length}`);
}
