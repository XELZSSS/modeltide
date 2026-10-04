import { fnv1aHash } from "@/server/infra/hash";

export function isTrimWhitespace(c: number): boolean {
  return (
    (c >= 0x09 && c <= 0x0d) ||
    c === 0x20 ||
    c === 0xa0 ||
    c === 0x1680 ||
    (c >= 0x2000 && c <= 0x200a) ||
    c === 0x2028 ||
    c === 0x2029 ||
    c === 0x202f ||
    c === 0x205f ||
    c === 0x3000 ||
    c === 0xfeff
  );
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
