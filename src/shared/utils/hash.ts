/**
 * FNV-1a, 32-bit. One copy, because two consumers hash the same strings (the cache keys and the provider dot hue); a
 * second hand-written loop diverges silently the day one changes its constants.
 */
export function fnv1aHashUint32(raw: string, seed = 2166136261, prime = 16777619): number {
  let h = seed;
  for (let i = 0; i < raw.length; i++) {
    h ^= raw.charCodeAt(i);
    h = Math.imul(h, prime);
  }
  return h >>> 0;
}

/** The same hash as a short base-36 string, for keys that need to stay readable. */
export function fnv1aHash(raw: string, seed = 2166136261, prime = 16777619): string {
  return fnv1aHashUint32(raw, seed, prime).toString(36);
}
