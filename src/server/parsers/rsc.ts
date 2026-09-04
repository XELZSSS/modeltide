import { UpstreamError } from "@/server/infra";

export const MAX_RSC_BYTES = 5 * 1024 * 1024;
/** Traversal node budget against malicious payloads burning CPU. */
const MAX_RSC_NODES = 50_000;
/** Skip absurd single lines to keep per-line scans bounded. */
const MAX_RSC_LINE_CHARS = 2 * 1024 * 1024;

/** BFS traversal, shallowest-first, cycle-safe, with a node budget. */
function* traverse(root: unknown): Generator<unknown> {
  const seen = new Set<object>();
  const queue: unknown[] = [root];
  let visited = 0;
  let head = 0;
  while (head < queue.length) {
    const cur = queue[head++]!;
    if (!cur || typeof cur !== "object") continue;
    if (seen.has(cur as object)) continue;
    seen.add(cur as object);
    visited++;
    if (visited > MAX_RSC_NODES) {
      throw new UpstreamError(`RSC payload too complex (>${MAX_RSC_NODES} nodes)`);
    }
    yield cur;
    const children = Array.isArray(cur) ? cur : Object.values(cur as Record<string, unknown>);
    for (const v of children) if (v !== null && typeof v === "object") queue.push(v);
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

function isMarkerBoundary(line: string, marker: string): boolean {
  const q = `"${marker}"`;
  let idx = line.indexOf(q);
  while (idx !== -1) {
    const after = line.slice(idx + q.length);
    const trimmed = after.trimStart();
    // Whitespace-only tails aren't boundaries (prose may contain the marker).
    if (!trimmed) {
      idx = line.indexOf(q, idx + 1);
      continue;
    }
    const c = trimmed[0]!;
    if (c === ":" || c === "[" || c === '"' || c === "," || c === "}" || c === "]") return true;
    idx = line.indexOf(q, idx + 1);
  }
  return false;
}

// Next.js flight chunk ids are hex (e.g. `26:`, `2E:`); match both cases.
const STREAM_LINE_RE = /^[0-9a-fA-F]+:(.*)$/;

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
  if (!body.includes(marker)) {
    throw new UpstreamError(
      `RSC marker "${marker}" not found or payload empty. body length=${body.length} snippet=${JSON.stringify(body.slice(0, 200))}`,
    );
  }
  for (const line of body.split(/\r?\n/)) {
    if (line.length > MAX_RSC_LINE_CHARS || !isMarkerBoundary(line, marker)) continue;
    const res = tryParseCandidates(line, extract);
    if (res) return res;
  }
  throw new UpstreamError(
    `RSC marker "${marker}" not found or payload empty. body length=${body.length} snippet=${JSON.stringify(body.slice(0, 200))}`,
  );
}
