import { numCoerce, text } from "@/server/formats/scalars";
import { findLongestData } from "@/server/formats/rsc-data";
import { parseRscRows } from "@/server/formats/rsc-rows";
import type { ParseResult } from "@/server/formats/parse-result";
import type { DecisionIndexEntry, DecisionKind, DecisionScores } from "@/shared/types";
import type { AaContestantRow, AaDecisionScores } from "../wire";
import { decisionScoresOf } from "../wire-read";
import { droppedRows } from "./warnings";

/**
 * The page splits its rows into language models and decision models, and the ranking shows both. A kind this list does
 * not know is a schema change, so the row is dropped and counted.
 */
const DECISION_KINDS = ["llm", "decisionModel"] as const satisfies readonly DecisionKind[];

function kindOf(raw: string): DecisionKind | null {
  return DECISION_KINDS.find((kind) => kind === raw) ?? null;
}

function scoresOf(raw: AaDecisionScores | undefined): DecisionScores {
  return {
    omniscienceAccuracy: numCoerce(raw?.omniscienceAccuracy),
    omniscienceNonHallucinationRate: numCoerce(raw?.omniscienceNonHallucinationRate),
    omniscienceDecisionScore: numCoerce(raw?.omniscienceDecisionScore),
    hleAccuracy: numCoerce(raw?.hleAccuracy),
    hleNonHallucinationRate: numCoerce(raw?.hleNonHallucinationRate),
    hleDecisionScore: numCoerce(raw?.hleDecisionScore),
    when2callAccuracy: numCoerce(raw?.when2callAccuracy),
    when2callDecisionScore: numCoerce(raw?.when2callDecisionScore),
    evalsafeOnetAccuracy: numCoerce(raw?.evalsafeOnetAccuracy),
    evalsafeOnetDecisionScore: numCoerce(raw?.evalsafeOnetDecisionScore),
    documentDecisionAllPassRate: numCoerce(raw?.documentDecisionAllPassRate),
    documentDecisionDecisionScore: numCoerce(raw?.documentDecisionDecisionScore),
    invarianceAllPassRate: numCoerce(raw?.invarianceAllPassRate),
    invarianceSymmetry: numCoerce(raw?.invarianceSymmetry),
  };
}

function mapContestant(raw: AaContestantRow): DecisionIndexEntry | null {
  const id = text(raw.slug);
  const name = text(raw.name);
  const kind = kindOf(text(raw.kind));
  const index = numCoerce(raw.indexScore);
  if (!id || !name || kind === null || index == null) return null;
  return {
    id,
    name,
    creator: text(raw.creatorName),
    kind,
    index,
    costPerTaskUsd: numCoerce(raw.costPerTaskUsd),
    timePerTaskMs: numCoerce(raw.timePerTaskMs),
    scores: scoresOf(decisionScoresOf(raw)),
  };
}

/** The page is a Next.js App Router route: rows arrive as one Flight prop (`contestants`), not a JSON endpoint. The shell's legend snapshot carries a shorter `contestants`, so `findLongestData` takes the longer array. */
export function parseDecisionRows(body: unknown): ParseResult<DecisionIndexEntry[]> {
  return parseRscRows<DecisionIndexEntry>(body, {
    label: "Decision index",
    marker: "contestants",
    find: findLongestData,
    map: (row) => mapContestant(row),
    dropped: (count) => droppedRows(count, "decision rows without a usable identity, kind or index"),
  });
}
