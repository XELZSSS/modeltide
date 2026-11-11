import { isRecord } from "./scalars";

interface MappedRows<T> {
  rows: T[];
  dropped: number;
}

/**
 * Maps a wire array onto public rows, counting everything the mapper rejects (including non-object entries) so callers
 * can report a drop count without repeating the loop. `limit` bounds the rows produced: a source with a shelf of its own
 * passes it and stops scanning there, and `dropped` counts what the mapper rejected up to that point.
 */
export function mapRows<T>(
  raw: readonly unknown[],
  map: (row: Record<string, unknown>) => T | null,
  limit = Number.POSITIVE_INFINITY,
): MappedRows<T> {
  const rows: T[] = [];
  let dropped = 0;
  for (const item of raw) {
    if (rows.length >= limit) break;
    if (!isRecord(item)) {
      dropped += 1;
      continue;
    }
    const row = map(item);
    if (row === null) {
      dropped += 1;
      continue;
    }
    rows.push(row);
  }
  return { rows, dropped };
}
