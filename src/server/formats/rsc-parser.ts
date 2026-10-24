import { UpstreamError } from "@/server/api/errors";
import { utf8ByteLength } from "@/server/util/hash";
import { MAX_RSC_BYTES, MAX_RSC_LINE_CHARS, type RscExtractor } from "./limits";
import { findMarkerValue, iterateLines, markerNeedle, rscNotFoundMessage } from "./rsc-text";
import { jsonCandidates, scanOversizedMarkers } from "./rsc-scan";
import { parseFail, parseOk, type ParseResult } from "./parse-result";
/**
 * Resolves markers against one stream line that fits the parse budget. The needle gate decides which markers this
 * line may resolve: the extractors key off their marker argument, so trees are only offered to gate-hitting markers.
 */
function resolveLine<T>(
  line: string,
  markers: readonly string[],
  needles: readonly string[],
  results: (T[] | null)[],
  extract: RscExtractor<T>,
): number {
  const hits: number[] = [];
  for (let mi = 0; mi < markers.length; mi++) {
    if (!results[mi] && findMarkerValue(line, needles[mi]!) !== null) hits.push(mi);
  }
  if (hits.length === 0) return 0;
  const trees = new Map<string, unknown>();
  const treeOf = (raw: string): unknown => {
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
  for (const raw of jsonCandidates(line)) {
    const tree = treeOf(raw);
    if (tree === undefined) continue;
    for (const mi of hits) {
      if (results[mi]) continue;
      const value = extract(tree, markers[mi]!);
      if (value && value.length > 0) {
        results[mi] = value;
        resolved++;
      }
    }
    if (hits.every((mi) => results[mi] !== null)) break;
  }
  return resolved;
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
  try {
    for (const line of iterateLines(body)) {
      if (unresolved === 0) break;
      if (line.length > maxLineLen) maxLineLen = line.length;
      unresolved -=
        line.length > MAX_RSC_LINE_CHARS
          ? scanOversizedMarkers(line, markers, results, extract)
          : resolveLine(line, markers, needles, results, extract);
    }
  } catch (err) {
    if (err instanceof UpstreamError) return parseFail(err.message);
    throw err;
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
