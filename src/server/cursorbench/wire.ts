/**
 * CursorBench's wire contract: one server-rendered HTML table.
 *
 * There is no JSON behind the page — the leaderboard is one `<table>`, and a row is six cells in this order. The order
 * *is* the contract: the parser reads positionally, so a column inserted or reordered upstream shifts every field after
 * it. Naming them here is what lets the parser state which cell it takes and lets the cell count be derived instead of
 * declared beside it.
 */
const CURSORBENCH_COLUMNS = ["rank", "model", "score", "costPerTask", "tokensPerTask", "stepsPerTask"] as const;

/** A row must carry every column the ranking prints; a shorter row is a different table and is dropped. */
export const CURSORBENCH_CELL_COUNT = CURSORBENCH_COLUMNS.length;

/** One row's cell texts, positionally: markup and entities already stripped, one string per column. */
export type CursorBenchCells = readonly string[];
