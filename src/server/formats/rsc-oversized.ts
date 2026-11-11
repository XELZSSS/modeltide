/** The one RSC line that cannot be `JSON.parse`d whole: a multi-megabyte stream line whose markers sit beside multi-MB siblings, so windows are widened around each needle and the marker's value is sliced structurally when none parses. */
import { balancedJsonSlice, type ScanSpend } from "./json-balance";
import { tryJsonParse } from "./json-parse";
import { findNeedlePositions, markerNeedle, markerValueAt } from "./rsc-text";
import { MAX_NEEDLE_CANDIDATES, MAX_RSC_BYTES, MAX_SCAN_CHARS, STREAM_LINE_RE, type RscExtractor } from "./limits";
import { takeValue } from "./rsc-scan";

/** Candidate JSON documents in a stream chunk: the de-prefixed payload first, then the raw text. */
export function jsonCandidates(text: string): string[] {
  const prefixed = STREAM_LINE_RE.exec(text)?.[1];
  return prefixed !== undefined && prefixed !== text ? [prefixed, text] : [text];
}

/** Offers a parsed document to every unresolved marker; returns how many it resolved. Extraction failures are UpstreamErrors and abort the whole scan. */
function offerToMarkers<T>(
  tree: unknown,
  markers: readonly string[],
  results: (T[] | null)[],
  extract: RscExtractor<T>,
): number {
  let resolved = 0;
  for (let mi = 0; mi < markers.length; mi++) {
    if (results[mi]) continue;
    if (takeValue(results, mi, extract(tree, markers[mi]!))) resolved++;
  }
  return resolved;
}

const WINDOW_STEPS_CHARS = [64 * 1024, 512 * 1024, MAX_RSC_BYTES] as const;
const WINDOW_PREFIX_CHARS = 4096;

function oversizedTrees(
  line: string,
  idx: number,
  marker: string,
  budgetChars: number,
): { trees: unknown[]; spent: number } {
  let spent = 0;
  const parse = (text: string): unknown | undefined => {
    if (text.length > MAX_RSC_BYTES || budgetChars - spent <= 0) return undefined;
    spent += text.length;
    return tryJsonParse(text);
  };
  const start = Math.max(0, idx - WINDOW_PREFIX_CHARS);
  for (const step of WINDOW_STEPS_CHARS) {
    // Each step slices up to `step` characters before `parse` can reject them, so the budget is spent before the build.
    if (budgetChars - spent <= 0) break;
    for (const candidate of jsonCandidates(line.slice(start, Math.min(line.length, idx + step)))) {
      const tree = parse(candidate);
      if (tree !== undefined) return { trees: [tree], spent };
    }
  }
  // No window parsed as a whole document: the marker's value may sit beside a multi-MB sibling, so slice it
  // structurally and hand the extractor a one-key tree.
  const valueAt = markerValueAt(line, idx, markerNeedle(marker));
  if (valueAt === null) return { trees: [], spent };
  const open = line.charAt(valueAt);
  if (open !== "[" && open !== "{") return { trees: [], spent };
  // Charge the structural walk to `spend`: it can step over `MAX_SCAN_CHARS` characters per call, and leaving it out
  // let each of the `MAX_NEEDLE_CANDIDATES` positions scan a multi-MB line again on a budget it never consumed.
  const scan: ScanSpend = { chars: 0 };
  const slice = balancedJsonSlice(line, valueAt, Math.min(MAX_SCAN_CHARS, budgetChars - spent), scan);
  spent += scan.chars;
  if (slice == null) return { trees: [], spent };
  const value = tryJsonParse(slice);
  return value === undefined ? { trees: [], spent } : { trees: [{ [marker]: value }], spent };
}

function needlePositions(
  line: string,
  markers: readonly string[],
  results: readonly (unknown[] | null)[],
): { idx: number; mi: number }[] {
  const positions: { idx: number; mi: number }[] = [];
  for (let mi = 0; mi < markers.length; mi++) {
    if (results[mi]) continue;
    for (const idx of findNeedlePositions(line, markerNeedle(markers[mi]!), MAX_NEEDLE_CANDIDATES)) {
      positions.push({ idx, mi });
    }
  }
  return positions.sort((a, b) => a.idx - b.idx);
}

/** Resolves markers from a line too long to parse whole; returns how many markers this line resolved. */
export function scanOversizedMarkers<T>(
  line: string,
  markers: readonly string[],
  results: (T[] | null)[],
  extract: RscExtractor<T>,
): number {
  let resolved = 0;
  let workLeft = MAX_SCAN_CHARS;
  for (const { idx, mi } of needlePositions(line, markers, results)) {
    if (workLeft <= 0) break;
    if (results[mi]) continue;
    const { trees, spent } = oversizedTrees(line, idx, markers[mi]!, workLeft);
    workLeft -= spent;
    for (const tree of trees) {
      resolved += offerToMarkers(tree, markers, results, extract);
      if (results[mi]) break;
    }
  }
  return resolved;
}
