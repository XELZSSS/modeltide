import { UpstreamError } from "@/server/infra/errors";
import { utf8ByteLength } from "@/server/infra/hash";
import {
  isMarkerBoundary,
  iterateLines,
  rscNotFoundMessage,
  scanOversizedMarkers,
  STREAM_LINE_RE,
  MAX_RSC_BYTES,
  MAX_RSC_LINE_CHARS,
  type RscExtractor,
} from "@/server/parsers/rsc-scanner";
import { parseFail, parseOk, type ParseResult } from "@/server/parsers/parse-result";

const MAX_RSC_NODES = 50_000;

function scanStep<T>(step: () => T): ParseResult<T> {
  try {
    return parseOk(step());
  } catch (err) {
    if (!(err instanceof UpstreamError)) throw err;
    return parseFail(err.message);
  }
}

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

interface KeyArrays<T> {
  first?: T[] | null;
  longest?: T[] | null;
}

const ARRAYS_BY_TREE = new WeakMap<object, Map<string, KeyArrays<unknown>>>();

function scanKeyArrays<T>(root: object, key: string, longest: boolean): KeyArrays<T> {
  let byKey = ARRAYS_BY_TREE.get(root);
  if (!byKey) {
    byKey = new Map();
    ARRAYS_BY_TREE.set(root, byKey);
  }
  let found = byKey.get(key) as KeyArrays<T> | undefined;
  if (!found) {
    found = {};
    byKey.set(key, found);
  }
  if (found.first !== undefined && (!longest || found.longest !== undefined)) return found;
  let best: T[] | null = null;
  for (const node of traverse(root)) {
    const raw = (node as Record<string, unknown>)[key];
    if (!Array.isArray(raw)) continue;
    if (found.first === undefined) {
      found.first = raw as T[];
      if (!longest) return found;
    }
    if (!best || raw.length > best.length) best = raw as T[];
  }
  if (found.first === undefined) found.first = null;
  if (longest) found.longest = best && best.length > 0 ? best : null;
  return found;
}

export function findNextData<T>(root: unknown, key: string): T[] | null {
  if (typeof key !== "string" || !key || root === null || typeof root !== "object") return null;
  return scanKeyArrays<T>(root, key, false).first ?? null;
}

export function findLongestData<T>(root: unknown, key: string): T[] | null {
  if (typeof key !== "string" || !key || root === null || typeof root !== "object") return null;
  return scanKeyArrays<T>(root, key, true).longest ?? null;
}

export function parseRscPayloads<T>(
  body: unknown,
  markers: readonly string[],
  extract: RscExtractor<T>,
): ParseResult<T[][]> {
  if (typeof body !== "string") return parseFail("RSC body is not a string");
  if (!Array.isArray(markers) || markers.length === 0 || markers.some((m) => typeof m !== "string" || !m)) {
    return parseFail("RSC markers are invalid");
  }
  if (typeof extract !== "function") return parseFail("RSC extractor is invalid");
  const byteLength = utf8ByteLength(body);
  if (byteLength > MAX_RSC_BYTES) {
    return parseFail(`RSC body too large (${byteLength} bytes, limit ${MAX_RSC_BYTES})`);
  }
  const results: (T[] | null)[] = markers.map(() => null);
  let unresolved = markers.length;
  let maxLineLen = 0;
  for (const line of iterateLines(body)) {
    if (unresolved === 0) break;
    if (line.length > maxLineLen) maxLineLen = line.length;
    if (line.length > MAX_RSC_LINE_CHARS) {
      const oversize = scanStep(() => scanOversizedMarkers(line, markers, results, extract));
      if (!oversize.ok) return oversize;
      unresolved -= oversize.data;
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
        const scanned = scanStep(() => extract(tree, markers[mi]!));
        if (!scanned.ok) return scanned;
        const res = scanned.data;
        if (res && res.length > 0) {
          results[mi] = res;
          unresolved--;
          break;
        }
      }
    }
  }
  for (let mi = 0; mi < markers.length; mi++) {
    if (!results[mi]) return parseFail(rscNotFoundMessage(markers[mi]!, body, maxLineLen));
  }
  return parseOk(results as T[][]);
}

export function parseRscPayload<T>(body: unknown, marker: string, extract: RscExtractor<T>): ParseResult<T[]> {
  const scanned = parseRscPayloads(body, [marker], extract);
  return scanned.ok ? parseOk(scanned.data[0]!) : scanned;
}
