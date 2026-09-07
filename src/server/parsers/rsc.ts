import { UpstreamError } from "@/server/infra/errors";
import { balancedJsonEnd } from "@/server/parsers/balanced";
import { fnv1aHash, utf8ByteLength } from "@/shared/utils";

export const MAX_RSC_BYTES = 5 * 1024 * 1024;
const MAX_RSC_NODES = 50_000;
const MAX_RSC_LINE_CHARS = 2 * 1024 * 1024;
export const MAX_SCAN_CHARS = 8_000_000;

function* traverse(root: unknown): Generator<unknown> {
  const seen = new Set<object>();
  const queue: unknown[] = [root];
  let visited = 0;
  let head = 0;
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

const STREAM_LINE_RE = /^[0-9a-fA-F]+:(.*)$/;

function* iterateLines(body: string): Generator<string> {
  let start = 0;
  while (start <= body.length) {
    const nl = body.indexOf("\n", start);
    if (nl === -1) {
      yield body.slice(start);
      return;
    }
    let end = nl;
    if (end > start && body[end - 1] === "\r") end--;
    yield body.slice(start, end);
    start = nl + 1;
  }
}

function rscNotFound(marker: string, body: string, maxLineLen = 0): UpstreamError {
  return new UpstreamError(
    `RSC marker "${marker}" not found or payload empty. body length=${body.length}` +
      (maxLineLen > 0 ? ` maxLine=${maxLineLen}` : "") +
      ` hash=${fnv1aHash(body.slice(0, 1024))}`,
  );
}

const MAX_OVERSIZED_WORK_CHARS = MAX_SCAN_CHARS;

function scanOversizedMarkers<T>(
  line: string,
  markers: readonly string[],
  results: (T[] | null)[],
  extract: (data: unknown) => T[] | null,
): number {
  const positions = collectNeedlePositions(line, markers, results);
  positions.sort((a, b) => a.idx - b.idx);
  const before = results.filter(Boolean).length;
  let workLeft = MAX_OVERSIZED_WORK_CHARS;
  for (const { idx, mi } of positions) {
    if (workLeft <= 0) break;
    const marker = markers[mi];
    if (results[mi] || marker == null) continue;
    const { trees, spent } = parseWindowCandidates(line, idx, marker, workLeft);
    workLeft -= spent;
    for (const tree of trees) {
      if (offerTreeToMarkers(tree, markers, results, extract, mi)) break;
    }
  }
  return results.filter(Boolean).length - before;
}

function collectNeedlePositions(
  line: string,
  markers: readonly string[],
  results: readonly (unknown[] | null)[],
): { idx: number; mi: number }[] {
  const positions: { idx: number; mi: number }[] = [];
  for (let mi = 0; mi < markers.length; mi++) {
    if (results[mi]) continue;
    const needle = `"${markers[mi]}"`;
    let from = 0;
    while (from <= line.length) {
      const idx = line.indexOf(needle, from);
      if (idx === -1) break;
      positions.push({ idx, mi });
      from = idx + 1;
      if (from > MAX_RSC_BYTES) break;
    }
  }
  return positions;
}

const OVERSIZED_WINDOW_STEPS = [64 * 1024, 512 * 1024, MAX_RSC_BYTES] as const;

function parseWindowCandidates(
  line: string,
  idx: number,
  marker: string,
  budgetChars: number,
): { trees: unknown[]; spent: number } {
  const start = Math.max(0, idx - 4096);
  let spent = 0;
  for (const step of OVERSIZED_WINDOW_STEPS) {
    const chunk = line.slice(start, Math.min(line.length, idx + step));
    const prefixed = STREAM_LINE_RE.exec(chunk)?.[1];
    for (const raw of [prefixed, chunk]) {
      if (!raw || raw.length > MAX_RSC_BYTES) continue;
      if (budgetChars - spent <= 0) return { trees: [], spent };
      spent += raw.length;
      try {
        return { trees: [JSON.parse(raw)], spent };
      } catch {}
    }
  }
  const slice = parseBalancedMarkerValue(line, idx, marker, budgetChars - spent);
  if (slice == null) return { trees: [], spent };
  spent += slice.length;
  try {
    return { trees: [{ [marker]: JSON.parse(slice) }], spent };
  } catch {
    return { trees: [], spent };
  }
}

function parseBalancedMarkerValue(line: string, idx: number, marker: string, budgetChars: number): string | null {
  if (budgetChars <= 0) return null;
  const needle = `"${marker}"`;
  const colonAt = line.indexOf(":", idx + needle.length);
  if (colonAt === -1 || colonAt > idx + needle.length + 64) return null;
  let v = colonAt + 1;
  while (v < line.length && " \t\r\n".includes(line.charAt(v))) v++;
  const open = line.charAt(v);
  if (open !== "[" && open !== "{") return null;
  const maxEnd = Math.min(line.length, v + MAX_SCAN_CHARS, v + budgetChars);
  const end = balancedJsonEnd(line, v, maxEnd - v);
  return end === -1 ? null : line.slice(v, end);
}

function offerTreeToMarkers<T>(
  tree: unknown,
  markers: readonly string[],
  results: (T[] | null)[],
  extract: (data: unknown) => T[] | null,
  anchorMi: number,
): boolean {
  let anchored = false;
  for (let mj = 0; mj < markers.length; mj++) {
    if (results[mj]) continue;
    const res = extract(tree);
    if (res && res.length > 0) {
      results[mj] = res;
      if (mj === anchorMi) anchored = true;
    }
  }
  return anchored;
}

export function parseRscPayloads<T>(
  body: string,
  markers: readonly string[],
  extract: (data: unknown) => T[] | null,
): T[][] {
  const byteLength = utf8ByteLength(body);
  if (byteLength > MAX_RSC_BYTES)
    throw new UpstreamError(`RSC body too large (${byteLength} bytes, limit ${MAX_RSC_BYTES})`);
  for (const marker of markers) {
    if (!body.includes(marker)) throw rscNotFound(marker, body);
  }
  const results: (T[] | null)[] = markers.map(() => null);
  let unresolved = markers.length;
  let maxLineLen = 0;
  for (const line of iterateLines(body)) {
    if (unresolved === 0) break;
    if (line.length > maxLineLen) maxLineLen = line.length;
    if (line.length > MAX_RSC_LINE_CHARS) {
      unresolved -= scanOversizedMarkers(line, markers, results, extract);
      continue;
    }
    const raws: string[] = [];
    const prefixed = STREAM_LINE_RE.exec(line)?.[1];
    if (prefixed && prefixed.length <= MAX_RSC_BYTES) raws.push(prefixed);
    if (line.length <= MAX_RSC_BYTES) raws.push(line);
    const trees = new Map<string, unknown>();
    const treeOf = (raw: string): unknown | undefined => {
      if (!trees.has(raw)) {
        try {
          trees.set(raw, JSON.parse(raw));
        } catch {
          trees.set(raw, undefined);
        }
      }
      return trees.get(raw);
    };
    for (let mi = 0; mi < markers.length; mi++) {
      if (results[mi] || !isMarkerBoundary(line, markers[mi]!)) continue;
      for (const raw of raws) {
        const tree = treeOf(raw);
        if (tree === undefined) continue;
        const res = extract(tree);
        if (res && res.length > 0) {
          results[mi] = res;
          unresolved--;
          break;
        }
      }
    }
    if (unresolved === 0) break;
  }
  for (let mi = 0; mi < markers.length; mi++) {
    if (!results[mi]) throw rscNotFound(markers[mi]!, body, maxLineLen);
  }
  return results as T[][];
}

export function parseRscPayload<T>(body: string, marker: string, extract: (data: unknown) => T[] | null): T[] {
  return parseRscPayloads(body, [marker], extract)[0]!;
}
