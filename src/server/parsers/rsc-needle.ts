import { balancedJsonSlice, type ScanSpend } from "@/server/parsers/json-balance";
import { isTrimWhitespace } from "@/server/parsers/rsc-text";
import {
  MAX_NEEDLE_CANDIDATES,
  MAX_NEEDLE_WORK_CHARS,
  MAX_SCAN_CHARS,
} from "@/server/parsers/rsc-limits";

interface NeedleScanOptions {
  prefixChars: number;
  smallSuffixChars: number;
  maxSuffixChars: number;
  unescape?: boolean;
}

interface NeedleCandidate {
  start: number;
  valueAt: number;
}

const EMBEDDED_ESCAPE_RE = /\\(.)/g;

function unescapeEmbedded(window: string): string {
  if (!window.includes("\\")) return window;
  return window.replace(EMBEDDED_ESCAPE_RE, (m, c: string) => (c === '"' ? '"' : c === "\\" ? "\\" : m));
}

function skipWs(text: string, pos: number): number {
  while (pos < text.length && isTrimWhitespace(text.charCodeAt(pos))) pos++;
  return pos;
}

function valuePosAfterColon(text: string, at: number): number | null {
  let c = skipWs(text, at);
  if (text[c] !== ":") return null;
  return skipWs(text, c + 1);
}

function collectNeedleCandidates(text: string, locators: readonly string[]): NeedleCandidate[] {
  const candidates: NeedleCandidate[] = [];
  for (const locator of locators) {
    let from = 0;
    for (;;) {
      const at = text.indexOf(locator, from);
      if (at === -1) break;
      from = at + 1;
      const valueAt = valuePosAfterColon(text, at + locator.length);
      if (valueAt !== null) candidates.push({ start: at, valueAt });
    }
  }
  return candidates.sort((a, b) => a.start - b.start);
}

function scanNeedleRange(
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
    const valueAt = valuePosAfterColon(src, at + needle.length);
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

function scanNeedleWindow(
  text: string,
  from: number,
  to: number,
  needle: string,
  unescape: boolean,
  found: unknown[],
  spend: ScanSpend,
): boolean {
  if (scanNeedleRange(text, from, to, needle, found, spend)) return true;
  if (!unescape) return false;
  const escapeAt = text.indexOf("\\", from);
  if (escapeAt === -1 || escapeAt >= to) return false;
  const segment = unescapeEmbedded(text.slice(from, to));
  return scanNeedleRange(segment, 0, segment.length, needle, found, spend);
}

export function extractNeedleJsonArrays(
  text: string,
  needle: string,
  opts: NeedleScanOptions,
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
    spend.chars += smallEnd - windowStart;
    if (!scanNeedleWindow(text, windowStart, smallEnd, needle, opts.unescape === true, found, spend)) {
      const maxEnd = Math.min(text.length, start + opts.maxSuffixChars);
      spend.chars += maxEnd - windowStart;
      scanNeedleWindow(text, windowStart, maxEnd, needle, opts.unescape === true, found, spend);
    }
  }
  return found;
}
