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
  type RscExtractor,
} from "@/server/parsers/rsc-scanner";

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

/**
 * First — or, with `longest`, largest — array stored under `key` anywhere in the
 * flight tree. `longest` keeps the first-encountered candidate on a length tie,
 * and only that mode treats an empty array as no match.
 */
function findArrayInTree<T>(root: unknown, key: string, longest: boolean): T[] | null {
  if (typeof key !== "string" || !key) return null;
  let best: T[] | null = null;
  for (const node of traverse(root)) {
    if (node === null || typeof node !== "object") continue;
    const raw = (node as Record<string, unknown>)[key];
    if (!Array.isArray(raw)) continue;
    const arr = raw as T[];
    if (!longest) return arr;
    if (!best || arr.length > best.length) best = arr;
  }
  if (!longest) return null;
  return best && best.length > 0 ? best : null;
}

export function findNextData<T>(root: unknown, key: string): T[] | null {
  return findArrayInTree<T>(root, key, false);
}

export function findLongestData<T>(root: unknown, key: string): T[] | null {
  return findArrayInTree<T>(root, key, true);
}

export function parseRscPayloads<T>(body: unknown, markers: readonly string[], extract: RscExtractor<T>): T[][] {
  if (typeof body !== "string") throw new UpstreamError("RSC body is not a string");
  if (!Array.isArray(markers) || markers.length === 0 || markers.some((m) => typeof m !== "string" || !m)) {
    throw new UpstreamError("RSC markers are invalid");
  }
  if (typeof extract !== "function") throw new UpstreamError("RSC extractor is invalid");
  const byteLength = utf8ByteLength(body);
  if (byteLength > MAX_RSC_BYTES)
    throw new UpstreamError(`RSC body too large (${byteLength} bytes, limit ${MAX_RSC_BYTES})`);
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
    const boundaries = markers.map((m) => isMarkerBoundary(line, m));
    if (!boundaries.some((hit, mi) => hit && !results[mi])) continue;
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
      if (results[mi] || !boundaries[mi]) continue;
      for (const raw of raws) {
        const tree = treeOf(raw);
        if (tree === undefined) continue;
        const res = extract(tree, markers[mi]!);
        if (res && res.length > 0) {
          results[mi] = res;
          unresolved--;
          break;
        }
      }
    }
  }
  for (let mi = 0; mi < markers.length; mi++) {
    if (!results[mi]) throw rscNotFound(markers[mi]!, body, maxLineLen);
  }
  return results as T[][];
}

export function parseRscPayload<T>(body: string, marker: string, extract: RscExtractor<T>): T[] {
  return parseRscPayloads(body, [marker], extract)[0]!;
}
