import { UpstreamError } from "@/server/infra";

export const MAX_RSC_BYTES = 5 * 1024 * 1024;
/** Traversal node budget against malicious payloads burning CPU. */
const MAX_RSC_NODES = 50_000;
/** Skip absurd single lines to keep per-line scans bounded. */
const MAX_RSC_LINE_CHARS = 2 * 1024 * 1024;
/** Bracket-scan bound for flight-payload extraction (changelog shares it). */
export const MAX_SCAN_CHARS = 8_000_000;

/** BFS traversal, shallowest-first, cycle-safe, with a node budget. */
function* traverse(root: unknown): Generator<unknown> {
  const seen = new Set<object>();
  const queue: unknown[] = [root];
  let visited = 0;
  let head = 0;
  // Bound queue growth as well: a single wide node could otherwise OOM
  // before the visited budget trips.
  const maxQueued = MAX_RSC_NODES * 4;
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
    for (const v of children) {
      if (v !== null && typeof v === "object") {
        if (queue.length >= maxQueued) {
          throw new UpstreamError(`RSC payload too wide (>${maxQueued} queued nodes)`);
        }
        queue.push(v);
      }
    }
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

/** Longest-array match: prefers the full leaderboard over preview slices. */
export function findLongestData<T>(root: unknown, key: string): T[] | null {
  let best: T[] | null = null;
  for (const node of traverse(root)) {
    const r = (node as Record<string, unknown>)[key];
    if (Array.isArray(r) && (!best || r.length > best.length)) {
      best = r as T[];
    }
  }
  return best && best.length > 0 ? best : null;
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

function hashSnippet(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

export function parseRscPayload<T>(body: string, marker: string, extract: (data: unknown) => T[] | null): T[] {
  let byteLength: number;
  try {
    byteLength = new TextEncoder().encode(body).length;
  } catch {
    byteLength = body.length * 3;
  }
  if (byteLength > MAX_RSC_BYTES)
    throw new UpstreamError(`RSC body too large (${byteLength} bytes, limit ${MAX_RSC_BYTES})`);
  if (!body.includes(marker)) {
    // Log-safe: length + hash only, no upstream verbatim (log-cost + leak).
    throw new UpstreamError(
      `RSC marker "${marker}" not found or payload empty. body length=${body.length} hash=${hashSnippet(body.slice(0, 1024))}`,
    );
  }
  for (const line of body.split(/\r?\n/)) {
    // Oversized minified single-line payloads still get a marker scan via
    // chunked indexOf instead of being skipped outright.
    if (line.length > MAX_RSC_LINE_CHARS) {
      let from = 0;
      let idx = line.indexOf(`"${marker}"`, from);
      while (idx !== -1 && idx < line.length) {
        const chunk = line.slice(Math.max(0, idx - 4096), idx + 65536);
        const res = tryParseCandidates(chunk, extract);
        if (res) return res;
        from = idx + 1;
        if (from > line.length - 8) break;
        idx = line.indexOf(`"${marker}"`, from);
        // Bound scans on pathological lines.
        if (from > MAX_RSC_BYTES) break;
      }
      continue;
    }
    if (!isMarkerBoundary(line, marker)) continue;
    const res = tryParseCandidates(line, extract);
    if (res) return res;
  }
  throw new UpstreamError(
    `RSC marker "${marker}" not found or payload empty. body length=${body.length} hash=${hashSnippet(body.slice(0, 1024))}`,
  );
}
