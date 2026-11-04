import { isRecord, numCoerce, textOrNull } from "@/server/formats/scalars";
import { ratioToPercent } from "@/shared/utils";
import { findLongestData } from "@/server/formats/rsc-data";
import { parseRscPayloads } from "@/server/formats/rsc-parser";
import { parseFail, parseOk, type ParseResult } from "@/server/formats/parse-result";
import type { CodingAgentEntry } from "@/shared/types";
import type { AaCodingAgentRow } from "../wire";

/**
 * The two props the leaderboard table is assembled from.
 *
 * `benchmarkRows` is the table's own row list, but eight of its entries are not rows at all: they are RSC references
 * (`$32:props:children:props:rows:0` …) pointing at the `rows` prop beside it, which carries the pairings the page
 * highlights. The table a reader sees is the union — and the union is what ranks `Claude Code` on `Claude Opus 5.5` first
 * at 61.7. `benchmarkRows` alone tops out at `Devin Fusion CLI` 61.5, which is what reading one prop produced.
 */
const CODING_AGENT_MARKERS = ["benchmarkRows", "rows"] as const;

/** One array entry: a row, or a reference into the other array. */
type CodingAgentWireEntry = AaCodingAgentRow | string;

export function parseCodingAgentsRows(body: unknown): ParseResult<CodingAgentEntry[]> {
  if (typeof body !== "string" || !body) return parseFail("Coding agents returned an empty body");
  const scanned = parseRscPayloads<CodingAgentWireEntry>(body, CODING_AGENT_MARKERS, (tree, marker) =>
    findLongestData<CodingAgentWireEntry>(tree, marker),
  );
  if (!scanned.ok) return parseFail(`Coding agents parse failed: ${scanned.error}`);

  const entries: CodingAgentEntry[] = [];
  let dropped = 0;
  for (const wire of scanned.data.flat()) {
    // A reference points into `rows`, which this loop reaches on its own: counting it would report a wiring detail as
    // lost data, and it carries no field to read.
    if (typeof wire === "string") continue;
    const entry = mapEntry(wire);
    if (entry === null) dropped++;
    else entries.push(entry);
  }
  return parseOk(entries, dropped > 0 ? [`Dropped ${dropped} coding-agent rows without an identity or score`] : []);
}

/**
 * One row → one ranking entry. `mapRows` is not used here because the two arrays are walked together; after the
 * reference strings are skipped, every entry is an object.
 *
 * Nothing here filters on `isUnavailable`: the page prints those rows too, and dropping one would renumber every place
 * below it. The score arrives as a 0-1 fraction (AA prints it 0-100), which is why `ratioToPercent` scales it and drops
 * a value that left that range.
 */
export function mapEntry(entry: AaCodingAgentRow): CodingAgentEntry | null {
  const id = textOrNull(entry.id);
  const agent = textOrNull(entry.agentName);
  const score = ratioToPercent(numCoerce(entry.indexScore));
  if (id == null || agent == null || score == null) return null;

  return {
    id,
    agent,
    creator: isRecord(entry.agentCreator) ? textOrNull(entry.agentCreator.name) : null,
    model: modelOf(entry),
    score,
  };
}

/**
 * The model(s) one row was scored on.
 *
 * A single-model pairing carries a `model` object, and its `shortName` is what the page prints. A router pairing
 * (GitHub Copilot, Devin Fusion — `isRouter: true`) carries `model: null` instead and spells the models it routes between
 * in `display.model` (`Copilot Fusion (max)`, `GPT-6 Astra XHigh + SWE-2 Medium`). Both are that row's model, so the
 * object wins where it exists and the display string is the fallback — reading only the object dropped the model from
 * every router row.
 */
function modelOf(entry: AaCodingAgentRow): string | null {
  if (isRecord(entry.model)) return textOrNull(entry.model.shortName);
  return isRecord(entry.display) ? textOrNull(entry.display.model) : null;
}
