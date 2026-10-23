import { balancedJsonSlice } from "./json-balance";
import { findNeedlePositions, markerNeedle, skipTrimWhitespace } from "./rsc-text";
import { MAX_NEEDLE_CANDIDATES, MAX_RSC_BYTES, MAX_SCAN_CHARS, STREAM_LINE_RE, type RscExtractor } from "./limits";

const MAX_OVERSIZED_WINDOWS = [64 * 1024, 512 * 1024, MAX_RSC_BYTES] as const;

function collectNeedlePositions(
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
  return positions;
}

function parseBalancedMarkerValue(line: string, idx: number, marker: string, budgetChars: number): string | null {
  if (budgetChars <= 0) return null;
  const needle = markerNeedle(marker);
  const colonAt = line.indexOf(":", idx + needle.length);
  if (colonAt === -1 || colonAt > idx + needle.length + 64) return null;
  const v = skipTrimWhitespace(line, colonAt + 1);
  const open = line.charAt(v);
  if (open !== "[" && open !== "{") return null;
  return balancedJsonSlice(line, v, Math.min(MAX_SCAN_CHARS, budgetChars));
}

function parseWindowCandidates(
  line: string,
  idx: number,
  marker: string,
  budgetChars: number,
): { trees: unknown[]; spent: number } {
  const start = Math.max(0, idx - 4096);
  let spent = 0;
  for (const step of MAX_OVERSIZED_WINDOWS) {
    const chunk = line.slice(start, Math.min(line.length, idx + step));
    const prefixed = STREAM_LINE_RE.exec(chunk)?.[1];
    // Stream prefix first, then the raw window, without the two-element array the old loop allocated per window.
    if (prefixed && prefixed !== chunk && prefixed.length <= MAX_RSC_BYTES) {
      if (budgetChars - spent <= 0) return { trees: [], spent };
      spent += prefixed.length;
      try {
        return { trees: [JSON.parse(prefixed)], spent };
      } catch {}
    }
    if (chunk.length <= MAX_RSC_BYTES) {
      if (budgetChars - spent <= 0) return { trees: [], spent };
      spent += chunk.length;
      try {
        return { trees: [JSON.parse(chunk)], spent };
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

function offerTreeToMarkers<T>(
  tree: unknown,
  markers: readonly string[],
  results: (T[] | null)[],
  extract: RscExtractor<T>,
  anchorMi: number,
): boolean {
  let anchored = false;
  for (let mj = 0; mj < markers.length; mj++) {
    if (results[mj]) continue;
    const res = extract(tree, markers[mj]!);
    if (res && res.length > 0) {
      results[mj] = res;
      if (mj === anchorMi) anchored = true;
    }
  }
  return anchored;
}

const countResolved = (results: readonly (unknown[] | null)[]): number => results.reduce((n, r) => (r ? n + 1 : n), 0);

export function scanOversizedMarkers<T>(
  line: string,
  markers: readonly string[],
  results: (T[] | null)[],
  extract: RscExtractor<T>,
): number {
  const positions = collectNeedlePositions(line, markers, results);
  positions.sort((a, b) => a.idx - b.idx);
  const before = countResolved(results);
  let workLeft = MAX_SCAN_CHARS;
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
  return countResolved(results) - before;
}
