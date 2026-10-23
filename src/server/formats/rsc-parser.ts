import { UpstreamError } from "@/server/api/errors";
import { utf8ByteLength } from "@/server/util/hash";
import { MAX_RSC_BYTES, MAX_RSC_LINE_CHARS, STREAM_LINE_RE, type RscExtractor } from "./limits";
import { isMarkerBoundaryAt, iterateLines, markerNeedle, rscNotFoundMessage } from "./rsc-text";
import { scanOversizedMarkers } from "./rsc-oversized";
import { parseFail, parseOk, type ParseResult } from "./parse-result";

function scanStep<T>(step: () => T): ParseResult<T> {
  try {
    return parseOk(step());
  } catch (err) {
    if (!(err instanceof UpstreamError)) throw err;
    return parseFail(err.message);
  }
}

function resolveMarkersInLine<T>(
  line: string,
  markers: readonly string[],
  needles: readonly string[],
  results: (T[] | null)[],
  extract: RscExtractor<T>,
): ParseResult<number> {
  const hits: number[] = [];
  for (let mi = 0; mi < markers.length; mi++) {
    if (!results[mi] && isMarkerBoundaryAt(line, needles[mi]!)) hits.push(mi);
  }
  if (hits.length === 0) return parseOk(0);
  const raws: string[] = [];
  const prefixed = STREAM_LINE_RE.exec(line)?.[1];
  if (prefixed && prefixed.length <= MAX_RSC_LINE_CHARS) raws.push(prefixed);
  if (line.length <= MAX_RSC_LINE_CHARS) raws.push(line);
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
  let resolved = 0;
  for (const mi of hits) {
    for (const raw of raws) {
      const tree = treeOf(raw);
      if (tree === undefined) continue;
      const scanned = scanStep(() => extract(tree, markers[mi]!));
      if (!scanned.ok) return scanned;
      if (scanned.data && scanned.data.length > 0) {
        results[mi] = scanned.data;
        resolved++;
        break;
      }
    }
  }
  return parseOk(resolved);
}

export function parseRscPayloads<T>(
  body: unknown,
  markers: readonly string[],
  extract: RscExtractor<T>,
): ParseResult<T[][]> {
  if (typeof body !== "string") return parseFail("RSC body is not a string");
  if (markers.length === 0 || markers.some((m) => !m)) {
    return parseFail("RSC markers are invalid");
  }
  // `body.length` counts UTF-16 code units and one costs at most 3 UTF-8 bytes, so the exact O(n) byte count is only
  // needed in the band where the cheap bounds cannot decide.
  const oversized =
    body.length > MAX_RSC_BYTES || (body.length * 3 > MAX_RSC_BYTES && utf8ByteLength(body) > MAX_RSC_BYTES);
  if (oversized) {
    return parseFail(`RSC body too large (${body.length} chars, limit ${MAX_RSC_BYTES} bytes)`);
  }
  const results: (T[] | null)[] = markers.map(() => null);
  const needles = markers.map(markerNeedle);
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
    const resolved = resolveMarkersInLine(line, markers, needles, results, extract);
    if (!resolved.ok) return resolved;
    unresolved -= resolved.data;
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
