/**
 * Needle scanning over RSC/Flight text: turns text around a `"marker":` occurrence into parsed JSON documents and resolves
 * markers against them. The per-line parser and the release index share these primitives; window widening for one
 * oversized line lives in `rsc-oversized`.
 */
import { balancedJsonSlice, type ScanSpend } from "./json-balance";
import { tryJsonParse } from "./json-parse";
import { markerValueAt } from "./rsc-text";
import { MAX_NEEDLE_CANDIDATES, MAX_NEEDLE_WORK_CHARS, MAX_SCAN_CHARS } from "./limits";

/** Files a marker's value unless the extractor came back empty: a resolved marker is one with rows. */
export function takeValue<T>(results: (T[] | null)[], mi: number, value: T[] | null): boolean {
  if (value === null || value.length === 0) return false;
  results[mi] = value;
  return true;
}

interface NeedleScanOptions {
  prefixChars: number;
  smallSuffixChars: number;
  maxSuffixChars: number;
}

/** What a needle pass could not turn into JSON; `balancedJsonSlice` guarantees balanced brackets, so a failure is real. */
export interface NeedleScanStats {
  unparsableSlices: number;
}

interface NeedleCandidate {
  start: number;
  valueAt: number;
}

const BACKSLASH = 0x5c;
const DOUBLE_QUOTE = 0x22;

/** Collapses the two escapes an RSC string layer introduces (`\"` and `\\`) and leaves every other escape verbatim, so `\n`/`\uXXXX` stay as written; a manual scan beats `replace(/\(.)/g, fn)`. */
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
  // Headroom on purpose: the caller keeps only the first `MAX_NEEDLE_CANDIDATES` candidates whose value is an array,
  // and a needle plus its escaped copy are both searched, so a 1:1 cap could end the scan before the arrays appear.
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

/** Parses every `"needle": [ ... ]` value in `[from, to)`; a `JSON.parse` failure is counted in `stats` rather than swallowed, so one malformed array cannot hide the arrays after it. */
function scanArrayValues(
  src: string,
  from: number,
  to: number,
  needle: string,
  found: unknown[],
  spend: ScanSpend,
  stats: NeedleScanStats,
): boolean {
  let parsed = false;
  let at = src.indexOf(needle, from);
  while (at !== -1 && at + needle.length <= to) {
    if (spend.chars >= MAX_NEEDLE_WORK_CHARS) return parsed;
    const valueAt = markerValueAt(src, at, needle);
    if (valueAt !== null && valueAt < to && src[valueAt] === "[") {
      const slice = balancedJsonSlice(src, valueAt, Math.min(MAX_SCAN_CHARS, to - valueAt), spend);
      if (slice != null) {
        const value = tryJsonParse(slice);
        if (value === undefined) {
          stats.unparsableSlices += 1;
        } else {
          found.push(value);
          parsed = true;
        }
      }
    }
    at = src.indexOf(needle, at + needle.length);
  }
  return parsed;
}

/** Scans `[from, to)` raw; when that finds nothing, scans an unescaped copy of the range (RSC embeds escaped documents). */
function scanWindow(
  text: string,
  from: number,
  to: number,
  needle: string,
  found: unknown[],
  spend: ScanSpend,
  stats: NeedleScanStats,
): boolean {
  spend.chars += to - from;
  if (scanArrayValues(text, from, to, needle, found, spend, stats)) return true;
  const escapeAt = text.indexOf("\\", from);
  if (escapeAt === -1 || escapeAt >= to) return false;
  const segment = unescapeEmbedded(text.slice(from, to));
  return scanArrayValues(segment, 0, segment.length, needle, found, spend, stats);
}

export function extractNeedleJsonArrays(
  text: string,
  needle: string,
  opts: NeedleScanOptions,
  stats: NeedleScanStats,
): unknown[] {
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
    if (!scanWindow(text, windowStart, smallEnd, needle, found, spend, stats)) {
      const maxEnd = Math.min(text.length, start + opts.maxSuffixChars);
      scanWindow(text, windowStart, maxEnd, needle, found, spend, stats);
    }
  }
  return found;
}
