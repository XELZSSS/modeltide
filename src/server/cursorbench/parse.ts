import { isValidRowId } from "@/server/formats/content-guards";
import { decodeEntities } from "@/server/formats/html-entities";
import { stripHtml } from "@/server/formats/html-to-text";
import { parseFail, parseOk, type ParseResult } from "@/server/formats/parse-result";
import { numCoerce } from "@/server/formats/scalars";
import type { CursorBenchEntry } from "@/shared/types";
import { CURSORBENCH_CELL_COUNT, cellOf, type CursorBenchCells } from "./wire";

/** CursorBench is an HTML page with no JSON behind it: the leaderboard is server-rendered as one `<table>`, six cells a row (rank, model, score, cost, tokens, steps), and the first table is the payload. Every scan is an `indexOf` walk rather than a regex, since a pattern that can backtrack across a large body must not run in a request. */
const TABLE_OPEN = "<table";
const TABLE_CLOSE = "</table>";
const BODY_OPEN = "<tbody";
const ROW_OPEN = "<tr";
const ROW_CLOSE = "</tr>";
const CELL_OPEN = "<td";
const CELL_CLOSE = "</td>";

const PERCENT_RE = /^\d+(?:\.\d+)?%$/;
const DIGITS_RE = /^\d+$/;
const NON_SLUG_RE = /[^a-z0-9]+/g;
const EDGE_DASH_RE = /^-+|-+$/g;

/** A cell's text: markup dropped (React's `<!-- -->` separators included), then entities decoded. */
function cellTextOf(fragment: string): string {
  return decodeEntities(stripHtml(fragment));
}

function slugOf(label: string): string {
  return label.toLowerCase().replace(NON_SLUG_RE, "-").replace(EDGE_DASH_RE, "");
}

/** `57.8%` → `57.8`: the page prints a percentage with one decimal and nothing is rescaled on the way in. */
function percentOf(text: string): number | null {
  return PERCENT_RE.test(text) ? Number(text.slice(0, -1)) : null;
}

/** `$13.43` → `13.43`, `$1,234.56` → `1234.56`. A cell without a dollar figure is `null`. */
function moneyOf(text: string): number | null {
  return text.startsWith("$") ? numCoerce(text.slice(1).replace(/,/g, "")) : null;
}

/** `218,363` → `218363`. Anything else is not a count. */
function countOf(text: string): number | null {
  const digits = text.replace(/,/g, "");
  return DIGITS_RE.test(digits) ? Number(digits) : null;
}

/** The first table's `<tbody>` … `</table>`: the rows carry no header, so the scan starts after `<tbody`. */
function tableBodyOf(html: string): string {
  const table = html.indexOf(TABLE_OPEN);
  if (table === -1) return "";
  const end = html.indexOf(TABLE_CLOSE, table);
  const body = html.indexOf(BODY_OPEN, table);
  return end === -1 || body === -1 || body > end ? "" : html.slice(body, end);
}

function cellsOf(row: string): CursorBenchCells {
  const cells: string[] = [];
  let pos = 0;
  for (;;) {
    const start = row.indexOf(CELL_OPEN, pos);
    if (start === -1) return cells;
    const open = row.indexOf(">", start);
    const end = open === -1 ? -1 : row.indexOf(CELL_CLOSE, open);
    if (end === -1) return cells;
    cells.push(cellTextOf(row.slice(open + 1, end)));
    pos = end + CELL_CLOSE.length;
  }
}

/** One row, or `null` when the cells are not the six the ranking prints. The label is the identity (`Opus 5.5 Max` and `Opus 5.5 High` are two entries), so its slug is the row key; every cell is read by column name. */
function entryOf(cells: CursorBenchCells): CursorBenchEntry | null {
  // The cell count is the gate: a shorter row is a different table.
  if (cells.length < CURSORBENCH_CELL_COUNT) return null;
  const model = cellOf(cells, "model");
  const rank = countOf(cellOf(cells, "rank"));
  const score = percentOf(cellOf(cells, "score"));
  const id = slugOf(model);
  if (rank == null || score == null || !isValidRowId(id)) return null;
  return {
    id,
    model,
    rank,
    score,
    costPerTask: moneyOf(cellOf(cells, "costPerTask")),
    tokensPerTask: countOf(cellOf(cells, "tokensPerTask")),
    stepsPerTask: countOf(cellOf(cells, "stepsPerTask")),
  };
}

export function parseCursorBench(html: string): ParseResult<CursorBenchEntry[]> {
  const body = tableBodyOf(html);
  if (body === "") return parseFail("cursorbench: the page carried no leaderboard table");

  const rows: CursorBenchEntry[] = [];
  const seen = new Set<string>();
  let dropped = 0;
  let pos = 0;
  for (;;) {
    const start = body.indexOf(ROW_OPEN, pos);
    if (start === -1) break;
    const end = body.indexOf(ROW_CLOSE, start);
    if (end === -1) break;
    pos = end + ROW_CLOSE.length;
    const entry = entryOf(cellsOf(body.slice(start, end)));
    // A label repeated in the table would break both the row key and the expand state, so the first one wins.
    if (entry === null || seen.has(entry.id)) {
      dropped += 1;
      continue;
    }
    seen.add(entry.id);
    rows.push(entry);
  }

  if (rows.length === 0) return parseFail("cursorbench: the leaderboard table carried no usable row");
  return parseOk(rows, dropped > 0 ? [`dropped ${dropped} unparsable row(s)`] : []);
}
