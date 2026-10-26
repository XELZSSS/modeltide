import { fnv1aHash } from "@/server/util/hash";

const TRIM_WHITESPACE = new Set([
  0x09,
  0x0a,
  0x0b,
  0x0c,
  0x0d,
  0x20,
  0xa0,
  0x1680,
  0x2028,
  0x2029,
  0x202f,
  0x205f,
  0x3000,
  0xfeff,
  ...Array.from({ length: 11 }, (_, i) => 0x2000 + i),
]);

const isTrimWhitespace = (c: number): boolean => TRIM_WHITESPACE.has(c);

/** Advances past the whitespace `String.prototype.trimStart` skips — wider than the four characters JSON allows between tokens, which keeps the needle gate as loose as the gate it replaced. */
function skipTrimWhitespace(text: string, pos: number): number {
  let at = pos;
  while (at < text.length && isTrimWhitespace(text.charCodeAt(at))) at++;
  return at;
}

export function markerNeedle(marker: string): string {
  return `"${marker}"`;
}

/** Collects up to `limit` non-overlapping-start offsets of `needle` in `text`, in ascending order. */
export function findNeedlePositions(text: string, needle: string, limit: number): number[] {
  const positions: number[] = [];
  let from = 0;
  while (positions.length < limit) {
    const idx = text.indexOf(needle, from);
    if (idx === -1) break;
    positions.push(idx);
    from = idx + 1;
  }
  return positions;
}

/** The value position of a `"marker": value` pair whose quoted key starts at `at`, or null. */
export function markerValueAt(text: string, at: number, needle: string): number | null {
  if (!text.startsWith(needle, at)) return null;
  const colon = skipTrimWhitespace(text, at + needle.length);
  if (text[colon] !== ":") return null;
  return skipTrimWhitespace(text, colon + 1);
}

/** The value position of the first `"needle": value` pair in `text`, or null when the key never carries a value. */
export function findMarkerValue(text: string, needle: string): number | null {
  let at = text.indexOf(needle);
  while (at !== -1) {
    const valueAt = markerValueAt(text, at, needle);
    if (valueAt !== null) return valueAt;
    at = text.indexOf(needle, at + 1);
  }
  return null;
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
