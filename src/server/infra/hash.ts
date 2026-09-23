const utf8Encoder = new TextEncoder();

// FNV-1a. `seed`/`prime` exist for the second, independent hash a key may need: it shares the
// loop but not the constants, so it cannot be a second call to the default form.
export function fnv1aHash(raw: string, seed = 2166136261, prime = 16777619): string {
  let h = seed;
  for (let i = 0; i < raw.length; i++) {
    h ^= raw.charCodeAt(i);
    h = Math.imul(h, prime);
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
