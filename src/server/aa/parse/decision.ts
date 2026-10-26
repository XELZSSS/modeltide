import { numCoerce, obj, text } from "@/server/formats/scalars";
import { findLongestData } from "@/server/formats/rsc-data";
import { parseRscRows } from "@/server/formats/rsc-rows";
import type { ParseResult } from "@/server/formats/parse-result";
import type { DecisionIndexEntry, DecisionKind, DecisionScores } from "@/shared/types";

/**
 * The evaluation page splits its rows into language models and decision models, and the ranking shows both. A kind this
 * list does not know is a schema change, so the row is dropped and counted instead of being filed under a guess.
 */
const DECISION_KINDS = ["llm", "decisionModel"] as const satisfies readonly DecisionKind[];

function kindOf(raw: string): DecisionKind | null {
  return DECISION_KINDS.find((kind) => kind === raw) ?? null;
}

function scoresOf(raw: Record<string, unknown> | undefined): DecisionScores {
  const score = (key: string): number | null => (raw === undefined ? null : numCoerce(raw[key]));
  return {
    omniscienceAccuracy: score("omniscienceAccuracy"),
    omniscienceNonHallucinationRate: score("omniscienceNonHallucinationRate"),
    hleTextMcqAccuracy: score("hleTextMcqAccuracy"),
    when2callAccuracy: score("when2callAccuracy"),
    wildguardtestAverageF1: score("wildguardtestAverageF1"),
  };
}

export function mapContestant(raw: Record<string, unknown>): DecisionIndexEntry | null {
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
    scores: scoresOf(obj(raw.scores)),
  };
}

/**
 * The page is a Next.js App Router route, so its rows arrive as one Flight payload prop (`contestants`) rather than as a
 * JSON endpoint. `findLongestData` walks the decoded tree: the shell also carries a `contestants` snapshot for the
 * chart's legend, and the leaderboard array is the longer of the two.
 */
export function parseDecisionRows(body: unknown): ParseResult<DecisionIndexEntry[]> {
  return parseRscRows<DecisionIndexEntry>(body, {
    label: "Decision index",
    marker: "contestants",
    find: findLongestData,
    map: mapContestant,
    dropped: (count) => `Dropped ${count} decision rows without a usable identity, kind or index`,
  });
}
