/**
 * FNV-1a, 32-bit. One copy, because two consumers hash the same strings: the cache keys (`server/util/hash.ts`) and
 * the provider dot hue (`shared/utils/color.ts`). A second hand-written loop is a silent divergence the day one of them
 * changes its constants, and neither shows it: keys just stop matching, colours just rotate.
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
