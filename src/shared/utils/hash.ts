const utf8Encoder = new TextEncoder();

export function fnv1aHash(raw: string): string {
  let h = 2166136261;
  for (let i = 0; i < raw.length; i++) {
    h ^= raw.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

export function utf8ByteLength(s: string): number {
  let ascii = true;
  for (let i = 0; i < s.length; i++) {
    if (s.charCodeAt(i) > 127) {
      ascii = false;
      break;
    }
  }
  if (ascii) return s.length;
  try {
    return utf8Encoder.encode(s).length;
  } catch {
    return s.length * 3;
  }
}
