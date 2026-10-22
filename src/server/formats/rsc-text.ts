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

export const isTrimWhitespace = (c: number): boolean => TRIM_WHITESPACE.has(c);

export function markerNeedle(marker: string): string {
  return `"${marker}"`;
}

export function isMarkerBoundaryAt(line: string, needle: string): boolean {
  let idx = line.indexOf(needle);
  while (idx !== -1) {
    let at = idx + needle.length;
    while (at < line.length && isTrimWhitespace(line.charCodeAt(at))) at++;
    if (at < line.length) {
      const c = line.charCodeAt(at);
      if (c === 0x3a || c === 0x5b || c === 0x22 || c === 0x2c || c === 0x7d || c === 0x5d) {
        return true;
      }
    }
    idx = line.indexOf(needle, idx + 1);
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
