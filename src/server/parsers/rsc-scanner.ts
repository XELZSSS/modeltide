import { fnv1aHash } from "@/server/infra/hash";

function balancedJsonEnd(text: string, openIdx: number, budget: number): number {
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

function balancedJsonSlice(text: string, openAt: number, budgetChars: number): string | null {
  const end = balancedJsonEnd(text, openAt, budgetChars);
  return end === -1 ? null : text.slice(openAt, end);
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

export function rscNotFoundMessage(marker: string, body: string, maxLineLen = 0): string {
  return (
    `RSC marker "${marker}" not found or payload empty. body length=${body.length}` +
    (maxLineLen > 0 ? ` maxLine=${maxLineLen}` : "") +
    ` hash=${fnv1aHash(body.slice(0, 1024))}`
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

export type RscExtractor<T> = (data: unknown, marker: string) => T[] | null;

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

export function scanOversizedMarkers<T>(
  line: string,
  markers: readonly string[],
  results: (T[] | null)[],
  extract: RscExtractor<T>,
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

function unescapeEmbedded(window: string): string {
  if (!window.includes("\\")) return window;
  return window.replace(/\\(.)/g, (m, c: string) => (c === '"' ? '"' : c === "\\" ? "\\" : m));
}

function skipWs(text: string, pos: number): number {
  while (pos < text.length && /\s/.test(text[pos]!)) pos++;
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

function parseJsonArrayAt(window: string, openAt: number, found: unknown[]): boolean {
  const slice = balancedJsonSlice(window, openAt, MAX_SCAN_CHARS);
  if (slice == null) return false;
  try {
    found.push(JSON.parse(slice));
    return true;
  } catch {
    return false;
  }
}

function scanNeedleWindow(window: string, needle: string, unescape: boolean, found: unknown[]): boolean {
  const scan = (haystack: string): boolean => {
    let parsed = false;
    let at = haystack.indexOf(needle);
    while (at !== -1) {
      const valueAt = valuePosAfterColon(haystack, at + needle.length);
      if (valueAt !== null) {
        if (haystack[valueAt] === "[" && parseJsonArrayAt(haystack, valueAt, found)) parsed = true;
      }
      at = haystack.indexOf(needle, at + needle.length);
    }
    return parsed;
  };
  // Unescaping is a fallback, never the first pass: on a plain-JSON window it turns valid JSON
  // into invalid JSON — silently dropping the whole array.
  if (scan(window)) return true;
  return unescape ? scan(unescapeEmbedded(window)) : false;
}

// Work ceilings for the needle scan: a hostile body repeating the needle could otherwise
// burn gigabytes of character work and abort on the Workers CPU limit.
const MAX_NEEDLE_CANDIDATES = 256;
const MAX_NEEDLE_WORK_CHARS = 64 * 1024 * 1024;

export function extractNeedleJsonArrays(text: string, needle: string, opts: NeedleScanOptions): unknown[] {
  const found: unknown[] = [];
  const escaped = needle.replace(/"/g, '\\"');
  const locators = escaped === needle ? [needle] : [needle, escaped];
  let candidates = 0;
  let workLeft = MAX_NEEDLE_WORK_CHARS;
  for (const { start, valueAt } of collectNeedleCandidates(text, locators)) {
    if (text[valueAt] !== "[") continue;
    if (candidates >= MAX_NEEDLE_CANDIDATES || workLeft <= 0) break;
    candidates += 1;
    const windowStart = Math.max(0, start - opts.prefixChars);
    const smallEnd = Math.min(text.length, start + opts.smallSuffixChars);
    workLeft -= smallEnd - windowStart;
    if (!scanNeedleWindow(text.slice(windowStart, smallEnd), needle, opts.unescape === true, found)) {
      const maxEnd = Math.min(text.length, start + opts.maxSuffixChars);
      workLeft -= maxEnd - windowStart;
      scanNeedleWindow(text.slice(windowStart, maxEnd), needle, opts.unescape === true, found);
    }
  }
  return found;
}
