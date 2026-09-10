import { UpstreamError } from "@/server/infra/errors";
import { fnv1aHash } from "@/shared/utils";

export function balancedJsonEnd(text: string, openIdx: number, budget: number): number {
  if (budget <= 0 || openIdx < 0 || openIdx >= text.length) return -1;
  const open = text.charCodeAt(openIdx);
  if (open !== 0x5b /* [ */ && open !== 0x7b /* { */) return -1;
  const maxEnd = Math.min(text.length, openIdx + budget);
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = openIdx; i < maxEnd; i++) {
    const c = text.charCodeAt(i);
    if (inStr) {
      if (esc) esc = false;
      else if (c === 0x5c /* \ */) esc = true;
      else if (c === 0x22 /* " */) inStr = false;
      continue;
    }
    if (c === 0x22 /* " */) {
      inStr = true;
      continue;
    }
    if (c === 0x5b /* [ */ || c === 0x7b /* { */) {
      depth++;
    } else if (c === 0x5d /* ] */ || c === 0x7d /* } */) {
      depth--;
      if (depth === 0) return i + 1;
    }
  }
  return -1;
}

export const MAX_RSC_BYTES = 5 * 1024 * 1024;
export const MAX_RSC_LINE_CHARS = 2 * 1024 * 1024;
export const MAX_SCAN_CHARS = 8_000_000;
const MAX_OVERSIZED_WORK_CHARS = MAX_SCAN_CHARS;
const MAX_OVERSIZED_WINDOWS = [64 * 1024, 512 * 1024, MAX_RSC_BYTES] as const;
export const STREAM_LINE_RE = /^[0-9a-fA-F]+:(.*)$/;

export function isMarkerBoundary(line: string, marker: string): boolean {
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

export function* iterateLines(body: string): Generator<string> {
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

export function rscNotFound(marker: string, body: string, maxLineLen = 0): UpstreamError {
  return new UpstreamError(
    `RSC marker "${marker}" not found or payload empty. body length=${body.length}` +
      (maxLineLen > 0 ? ` maxLine=${maxLineLen}` : "") +
      ` hash=${fnv1aHash(body.slice(0, 1024))}`,
  );
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

export function scanOversizedMarkers<T>(
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

// ── Needle-window JSON array extraction (HTML pages with embedded payloads) ──

export interface NeedleScanOptions {
  /** Context kept before each needle hit when building a scan window. */
  prefixChars: number;
  /** First-attempt suffix window; covers typical payload sizes cheaply. */
  smallSuffixChars: number;
  /** Fallback suffix window when the array does not close inside the small one. */
  maxSuffixChars: number;
  /** Unescape `\"`/`\\` before scanning (flight-embedded JSON-in-JSON strings). */
  unescape?: boolean;
}

interface NeedleCandidate {
  start: number;
  valueAt: number;
}

function unescapeEmbedded(window: string): string {
  // Skip the regex pass entirely when the window has no escapes at all
  // (the common case for non-embedded payloads).
  if (!window.includes("\\")) return window;
  return window.replace(/\\(.)/g, (m, c: string) => (c === '"' ? '"' : c === "\\" ? "\\" : m));
}

function collectNeedleCandidates(text: string, locators: readonly string[]): NeedleCandidate[] {
  const candidates: NeedleCandidate[] = [];
  for (const locator of locators) {
    let from = 0;
    for (;;) {
      const at = text.indexOf(locator, from);
      if (at === -1) break;
      from = at + 1;
      let c = at + locator.length;
      while (c < text.length && /\s/.test(text[c]!)) c++;
      if (text[c] !== ":") continue;
      c++;
      while (c < text.length && /\s/.test(text[c]!)) c++;
      candidates.push({ start: at, valueAt: c });
    }
  }
  return candidates.sort((a, b) => a.start - b.start);
}

function parseJsonArrayAt(window: string, openAt: number, found: unknown[]): boolean {
  const end = balancedJsonEnd(window, openAt, MAX_SCAN_CHARS);
  if (end === -1) return false;
  try {
    found.push(JSON.parse(window.slice(openAt, end)));
    return true;
  } catch {
    return false;
  }
}

function scanNeedleWindow(window: string, needle: string, unescape: boolean, found: unknown[]): boolean {
  const haystack = unescape ? unescapeEmbedded(window) : window;
  // Try every needle occurrence inside the window, not just the first: decoy
  // keys (non-array values) may precede the real payload, and a first-hit-only
  // scan would bail before reaching it.
  let parsed = false;
  let at = haystack.indexOf(needle);
  while (at !== -1) {
    let c = at + needle.length;
    while (c < haystack.length && /\s/.test(haystack[c]!)) c++;
    if (haystack[c] === ":") {
      c++;
      while (c < haystack.length && /\s/.test(haystack[c]!)) c++;
      if (haystack[c] === "[" && parseJsonArrayAt(haystack, c, found)) parsed = true;
    }
    at = haystack.indexOf(needle, at + needle.length);
  }
  return parsed;
}

/**
 * Extract every JSON array that sits at `<needle> : [...]` inside a text page,
 * in both plain and flight-escaped (`\"needle\"`) forms. Two-stage windows:
 * try a small suffix first (typical payloads), fall back to the full window
 * only when the array does not close inside it. Raw-text rejects non-`[` values
 * before any window slicing; JSON.parse failures are swallowed per candidate.
 */
export function extractNeedleJsonArrays(text: string, needle: string, opts: NeedleScanOptions): unknown[] {
  const found: unknown[] = [];
  const escaped = needle.replace(/"/g, '\\"');
  const locators = escaped === needle ? [needle] : [needle, escaped];
  for (const { start, valueAt } of collectNeedleCandidates(text, locators)) {
    // Cheap raw-text reject: in both plain and flight-escaped forms the array
    // bracket is never escaped, so a non-`[` value can be skipped first.
    if (text[valueAt] !== "[") continue;
    const windowStart = Math.max(0, start - opts.prefixChars);
    if (
      !scanNeedleWindow(
        text.slice(windowStart, Math.min(text.length, start + opts.smallSuffixChars)),
        needle,
        opts.unescape === true,
        found,
      )
    ) {
      scanNeedleWindow(
        text.slice(windowStart, Math.min(text.length, start + opts.maxSuffixChars)),
        needle,
        opts.unescape === true,
        found,
      );
    }
  }
  return found;
}
