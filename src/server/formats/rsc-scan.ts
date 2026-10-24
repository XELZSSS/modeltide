/**
 * Window scanning over RSC/Flight text: turns text around a `"marker":` occurrence into parsed JSON documents and
 * resolves markers against them. Two consumers: the per-line parser (oversized lines) and the needle extractor.
 */
import { balancedJsonSlice, type ScanSpend } from "./json-balance";
import { findNeedlePositions, markerNeedle, markerValueAt } from "./rsc-text";
import {
  MAX_NEEDLE_CANDIDATES,
  MAX_NEEDLE_WORK_CHARS,
  MAX_RSC_BYTES,
  MAX_SCAN_CHARS,
  STREAM_LINE_RE,
  type RscExtractor,
} from "./limits";

/** Candidate JSON documents in a stream chunk: the de-prefixed payload first, then the raw text. */
export function jsonCandidates(text: string): string[] {
  const prefixed = STREAM_LINE_RE.exec(text)?.[1];
  return prefixed !== undefined && prefixed !== text ? [prefixed, text] : [text];
}

/**
 * Offers a parsed document to every unresolved marker; returns how many markers this tree resolved. Extraction
 * failures are UpstreamErrors and abort the whole scan (the parser converts them to a ParseResult failure).
 */
function offerToMarkers<T>(
  tree: unknown,
  markers: readonly string[],
  results: (T[] | null)[],
  extract: RscExtractor<T>,
): number {
  let resolved = 0;
  for (let mi = 0; mi < markers.length; mi++) {
    if (results[mi]) continue;
    const value = extract(tree, markers[mi]!);
    if (value && value.length > 0) {
      results[mi] = value;
      resolved++;
    }
  }
  return resolved;
}

// --- Oversized line scan: the line cannot be JSON.parsed whole, so try widening windows around each needle. ---

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
    try {
      return JSON.parse(text);
    } catch {
      return undefined;
    }
  };
  const start = Math.max(0, idx - WINDOW_PREFIX_CHARS);
  for (const step of WINDOW_STEPS_CHARS) {
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
  const slice = balancedJsonSlice(line, valueAt, Math.min(MAX_SCAN_CHARS, budgetChars - spent));
  if (slice == null) return { trees: [], spent };
  try {
    return { trees: [{ [marker]: JSON.parse(slice) }], spent: spent + slice.length };
  } catch {
    return { trees: [], spent };
  }
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

// --- Needle scan: parse every `"needle": [ ... ]` array inside windows around each locator occurrence. ---

export interface NeedleScanOptions {
  prefixChars: number;
  smallSuffixChars: number;
  maxSuffixChars: number;
  unescape?: boolean;
}

interface NeedleCandidate {
  start: number;
  valueAt: number;
}

const BACKSLASH = 0x5c;
const DOUBLE_QUOTE = 0x22;

/**
 * Collapses the two escapes an RSC string layer introduces (`\"` and `\\`) and leaves every other escape verbatim.
 *
 * A manual scan replaces `replace(/\\\\(.)/g, fn)`: on a 1.9 MB leaderboard body the regex version cost 13 ms and this
 * one 5.6 ms, because the regex allocated a match result per escape (the body holds ~65k of them). Semantics are
 * unchanged — only `\"` and `\\` are rewritten, `\n`/`\uXXXX` stay as written, exactly as before.
 */
function unescapeEmbedded(window: string): string {
  if (!window.includes("\\")) return window;
  let out = "";
  let last = 0;
  for (let i = 0; i < window.length; i++) {
    if (window.charCodeAt(i) !== BACKSLASH) continue;
    const next = window.charCodeAt(i + 1);
    if (next !== DOUBLE_QUOTE && next !== BACKSLASH) continue;
    out += window.slice(last, i) + (next === DOUBLE_QUOTE ? '"' : "\\");
    i += 1;
    last = i + 1;
  }
  return last === 0 ? window : out + window.slice(last);
}

function collectNeedleCandidates(text: string, locators: readonly string[]): NeedleCandidate[] {
  const candidates: NeedleCandidate[] = [];
  const cap = MAX_NEEDLE_CANDIDATES * 4;
  for (const locator of locators) {
    let from = 0;
    for (;;) {
      if (candidates.length >= cap) break;
      const at = text.indexOf(locator, from);
      if (at === -1) break;
      from = at + 1;
      const valueAt = markerValueAt(text, at, locator);
      if (valueAt !== null) candidates.push({ start: at, valueAt });
    }
  }
  candidates.sort((a, b) => a.start - b.start);
  return candidates;
}

/** Parses every `"needle": [ ... ]` value in `[from, to)`, appending rows to `found`. */
function scanArrayValues(
  src: string,
  from: number,
  to: number,
  needle: string,
  found: unknown[],
  spend: ScanSpend,
): boolean {
  let parsed = false;
  let at = src.indexOf(needle, from);
  while (at !== -1 && at + needle.length <= to) {
    if (spend.chars >= MAX_NEEDLE_WORK_CHARS) return parsed;
    const valueAt = markerValueAt(src, at, needle);
    if (valueAt !== null && valueAt < to && src[valueAt] === "[") {
      const slice = balancedJsonSlice(src, valueAt, Math.min(MAX_SCAN_CHARS, to - valueAt), spend);
      if (slice != null) {
        try {
          found.push(JSON.parse(slice));
          parsed = true;
        } catch {}
      }
    }
    at = src.indexOf(needle, at + needle.length);
  }
  return parsed;
}

/**
 * Scans `[from, to)` raw; when that finds nothing and `unescape` is set, scans an unescaped copy of the same range
 * (RSC payloads embed documents as escaped strings).
 */
function scanWindow(
  text: string,
  from: number,
  to: number,
  needle: string,
  unescape: boolean,
  found: unknown[],
  spend: ScanSpend,
): boolean {
  spend.chars += to - from;
  if (scanArrayValues(text, from, to, needle, found, spend)) return true;
  if (!unescape) return false;
  const escapeAt = text.indexOf("\\", from);
  if (escapeAt === -1 || escapeAt >= to) return false;
  const segment = unescapeEmbedded(text.slice(from, to));
  return scanArrayValues(segment, 0, segment.length, needle, found, spend);
}

export function extractNeedleJsonArrays(text: string, needle: string, opts: NeedleScanOptions): unknown[] {
  const found: unknown[] = [];
  const escaped = needle.replace(/"/g, '\\"');
  const locators = escaped === needle ? [needle] : [needle, escaped];
  let candidates = 0;
  const spend: ScanSpend = { chars: 0 };
  for (const { start, valueAt } of collectNeedleCandidates(text, locators)) {
    if (text[valueAt] !== "[") continue;
    if (candidates >= MAX_NEEDLE_CANDIDATES || spend.chars >= MAX_NEEDLE_WORK_CHARS) break;
    candidates += 1;
    const windowStart = Math.max(0, start - opts.prefixChars);
    const smallEnd = Math.min(text.length, start + opts.smallSuffixChars);
    // The small window is re-scanned as part of the max window: it found nothing, so a straddling array can only
    // be found once here — no double pushes.
    if (!scanWindow(text, windowStart, smallEnd, needle, opts.unescape === true, found, spend)) {
      const maxEnd = Math.min(text.length, start + opts.maxSuffixChars);
      scanWindow(text, windowStart, maxEnd, needle, opts.unescape === true, found, spend);
    }
  }
  return found;
}
