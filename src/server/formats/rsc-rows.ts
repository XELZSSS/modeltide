import { mapRows } from "./parse-rows";
import { parseFail, parseOk, type ParseResult } from "./parse-result";
import { parseRscPayload } from "./rsc-parser";

/** What one RSC row parser has to say about its own payload. */
interface RscRowsSpec<T> {
  /** Names the payload in every message: "Text-to-image", "Decision index". */
  label: string;
  /** The Flight marker the row array is stored under. */
  marker: string;
  /** The row array of one decoded tree, e.g. `findLongestData` for a page carrying several copies. */
  find: (tree: unknown, marker: string) => Record<string, unknown>[] | null;
  /** Maps one wire row onto the public row, or `null` to drop it. */
  map: (row: Record<string, unknown>) => T | null;
  /** The warning text for the rows the mapper rejected. */
  dropped: (count: number) => string;
}

/**
 * The skeleton every "rows out of one Flight marker" parser shares: an empty body is a parse failure, the marker is
 * resolved through `parseRscPayload`, `mapRows` counts what the mapper rejects, and that count becomes the only warning.
 *
 * Written once because two parsers already spelled it out identically, and the third copy is what would have made the
 * three drift on message wording — the tests pin the messages, so a drift there is a silent difference in what a log
 * line says, not a failure.
 */
export function parseRscRows<T>(body: unknown, spec: RscRowsSpec<T>): ParseResult<T[]> {
  if (typeof body !== "string" || !body) return parseFail(`${spec.label} returned an empty body`);
  const scanned = parseRscPayload<Record<string, unknown>>(body, spec.marker, (tree) => spec.find(tree, spec.marker));
  if (!scanned.ok) return parseFail(`${spec.label} parse failed: ${scanned.error}`);
  const { rows, dropped } = mapRows(scanned.data, spec.map);
  return parseOk(rows, dropped > 0 ? [spec.dropped(dropped)] : []);
}
