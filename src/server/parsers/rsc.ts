import { UpstreamError } from "@/server/infra/errors";
import { utf8ByteLength } from "@/shared/utils";
import {
  isMarkerBoundary,
  iterateLines,
  rscNotFound,
  scanOversizedMarkers,
  STREAM_LINE_RE,
  MAX_RSC_BYTES,
  MAX_RSC_LINE_CHARS,
} from "@/server/parsers/rsc-scan";

export { balancedJsonEnd, MAX_SCAN_CHARS } from "@/server/parsers/rsc-scan";

const MAX_RSC_NODES = 50_000;

export function* traverse(root: unknown): Generator<unknown> {
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
    // Fast path: most flight lines carry no marker at all - skip the raws
    // array + parse-cache allocation unless a marker boundary is present.
    let anyMarker = false;
    for (let mi = 0; mi < markers.length; mi++) {
      if (!results[mi] && isMarkerBoundary(line, markers[mi]!)) {
        anyMarker = true;
        break;
      }
    }
    if (!anyMarker) continue;
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
