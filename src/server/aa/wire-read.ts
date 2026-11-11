import { isRecord, text } from "@/server/formats/scalars";
import type {
  AaContestantRow,
  AaDecisionScores,
  AaLeaderboardRow,
  AaOmniscienceBreakdown,
  AaRow,
  LeaderboardScores,
} from "./wire";
import { AA_ROW_GATES } from "./wire";

/** The readers of Artificial Analysis' wire shapes: one function per block a parser pulls out of a row, holding the casts and the runtime "is this row that shape" gates; the four dynamic-key accessors stay in `wire.ts`. */

/** The `scores` block of one contestant row. */
export function decisionScoresOf(row: AaContestantRow): AaDecisionScores | undefined {
  return isRecord(row.scores) ? (row.scores as AaDecisionScores) : undefined;
}

/** The `omniscienceBreakdown` block of one row, or `undefined` when the row carries none. */
export function omniscienceBreakdownOf(row: AaRow): AaOmniscienceBreakdown | undefined {
  return isRecord(row.omniscienceBreakdown) ? (row.omniscienceBreakdown as AaOmniscienceBreakdown) : undefined;
}

/**
 * Overlays one row's breakdown block onto another's: a field the patch carries wins, an absent one leaves the target's
 * value alone.
 */
export function overlayBreakdown(target: AaOmniscienceBreakdown, patch: AaOmniscienceBreakdown): void {
  const into = target as Record<string, unknown>;
  for (const [key, value] of Object.entries(patch)) {
    if (value === null || value === undefined || value === "") continue;
    into[key] = value;
  }
}

/** The `scores` object of one leaderboard row, read as the declared spelling set. */
export function leaderboardScores(row: AaLeaderboardRow): LeaderboardScores | undefined {
  return isRecord(row.scores) ? (row.scores as LeaderboardScores) : undefined;
}

/** A leaderboard row is usable only if it carries the index the ranking is ordered by: the `initialModels` prop also carries the page's legend and changelog snapshots, which must never reach the row loop. */
export function isLeaderboardRow(row: Record<string, unknown>): row is Record<string, unknown> & AaLeaderboardRow {
  return AA_ROW_GATES.leaderboardIndex in row;
}

/** Whether a slice of the leaderboard body is the model-link array rather than one of the rows beside it: the gate is on `releaseSlug`, which only a model link carries. */
export function hasReleaseLink(row: Record<string, unknown>): boolean {
  return AA_ROW_GATES.releaseLink in row;
}

/** The creator record a normalized row carries: AA sends `{ name, color }` or nothing. */
export function creatorOf(row: AaRow): { name: string; color: string } {
  const creator = isRecord(row.creator) ? row.creator : undefined;
  return { name: text(creator?.name), color: text(creator?.color) };
}
