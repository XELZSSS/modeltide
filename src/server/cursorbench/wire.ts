/**
 * CursorBench's wire contract: one server-rendered HTML table. A row is six cells in this order, and the order *is* the
 * contract: `cellOf` is the only place it is turned into an index.
 */
const CURSORBENCH_COLUMNS = ["rank", "model", "score", "costPerTask", "tokensPerTask", "stepsPerTask"] as const;

/** One column of the ranking, named as the parser reads it. */
export type CursorBenchColumn = (typeof CURSORBENCH_COLUMNS)[number];

/** A row must carry every column the ranking prints; a shorter row is a different table and is dropped. */
export const CURSORBENCH_CELL_COUNT = CURSORBENCH_COLUMNS.length;

/** One row's cell texts, positionally: markup and entities already stripped, one string per column. */
export type CursorBenchCells = readonly string[];

/**
 * One cell of a row, read by column name. A cell the row does not carry reads as empty text, which every field reader in
 * `parse.ts` already reports as `null`; the cell-count gate in `entryOf` rejects the short row.
 */
export function cellOf(cells: CursorBenchCells, column: CursorBenchColumn): string {
  return cells[CURSORBENCH_COLUMNS.indexOf(column)] ?? "";
}
