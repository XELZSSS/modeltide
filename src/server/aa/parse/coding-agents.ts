import { isRecord, numCoerce, textOrNull } from "@/server/formats/scalars";
import { ratioToPercent } from "@/shared/utils";
import { findLongestData } from "@/server/formats/rsc-data";
import { parseRscPayloads } from "@/server/formats/rsc-parser";
import { parseFail, parseOk, type ParseResult } from "@/server/formats/parse-result";
import type { CodingAgentEntry } from "@/shared/types";
import type { AaCodingAgentRow } from "../wire";
import { droppedRows } from "./warnings";

/** The two props the leaderboard table is assembled from: `benchmarkRows` holds the table's own rows, but eight entries are RSC references into the `rows` prop beside it, which carries the pairings the page highlights. The table a reader sees is the union — `benchmarkRows` alone tops out at `Devin Fusion CLI` 61.5. */
const CODING_AGENT_MARKERS = ["benchmarkRows", "rows"] as const;

/** One array entry: a row, or a reference into the other array. */
type CodingAgentWireEntry = AaCodingAgentRow | string;

export function parseCodingAgentsRows(body: unknown): ParseResult<CodingAgentEntry[]> {
  if (typeof body !== "string" || !body) return parseFail("Coding agents returned an empty body");
  const scanned = parseRscPayloads<CodingAgentWireEntry>(body, CODING_AGENT_MARKERS, (tree, marker) =>
    findLongestData<CodingAgentWireEntry>(tree, marker),
  );
  if (!scanned.ok) return parseFail(`Coding agents parse failed: ${scanned.error}`);

  // `scanned.data` is one array per prop — `benchmarkRows` first, then the `rows` the references point at — so walking it
  // walks the two in the page's order.
  const entries: CodingAgentEntry[] = [];
  let dropped = 0;
  for (const rows of scanned.data) {
    for (const wire of rows) {
      // A reference points into `rows`, which the next pass reaches on its own.
      if (typeof wire === "string") continue;
      const entry = mapEntry(wire);
      if (entry === null) dropped++;
      else entries.push(entry);
    }
  }
  return parseOk(entries, dropped > 0 ? [droppedRows(dropped, "coding-agent rows without an identity or score")] : []);
}

/** One row → one ranking entry. Nothing here filters on `isUnavailable`: the page prints those rows too. The score arrives as a 0-1 fraction (AA prints it 0-100), so `ratioToPercent` scales it and drops a value that left that range. */
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

/** The model(s) one row was scored on: a single-model pairing carries a `model` object whose `shortName` is what the page prints, and a router pairing (`isRouter: true`) carries `model: null` and spells the models in `display.model`. Both are that row's model, so the object wins where it exists. */
function modelOf(entry: AaCodingAgentRow): string | null {
  if (isRecord(entry.model)) return textOrNull(entry.model.shortName);
  return isRecord(entry.display) ? textOrNull(entry.display.model) : null;
}
