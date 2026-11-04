import { MODALITY_KEYS, type ModalityKey } from "@/shared/config";
import { isRecord, text } from "@/server/formats/scalars";
import type { BenchmarkWireName, LeaderboardScoreKey } from "./parse/benchmark-fields";

/**
 * Artificial Analysis' wire contract, in one module.
 *
 * Three shapes are kept apart on purpose, because they used to be one `Record<string, unknown>` that every layer wrote
 * with a hand-spelled string key:
 *
 * 1. **The page rows** (`AaLeaderboardRow`, `AaContestantRow`, `AaCodingAgentRow`, `AaChangelogRow`) spell the field names
 *    *as AA sends them* — `modelCreatorName`, `price1mInputTokens`, `scores["aa-analyst-agent"]`. They are only read by
 *    the parser that maps them, and every member is `unknown`: a Flight body is a trust boundary, so nothing here
 *    claims a type the upstream has not proven.
 * 2. **`AaRow`** is the row the leaderboard parser *normalizes* onto and the enrichment pages *project* onto: one
 *    spelling per concept, the one `/models` uses. Every reader downstream (`compact`, `mergeBySlug`, `backfillFromMeta`)
 *    speaks this shape only.
 * 3. **`ChangelogModel`** is the changelog's mapped output, the one derived shape that leaves this file's parsers and is
 *    consumed by `releases/parse.ts`.
 *
 * The point of the split is drift: a field renamed upstream, in the projection list, or in `compact` now fails the
 * build instead of producing rows that parse but carry `null`s, which is the failure mode this stack kept hitting
 * (`scores` vs camelCase benchmarks, `medianOutputTokensPerSecond` vs `medianCanonicalAnswerOutputSpeed`).
 */

/** The leaderboard's `scores` object carries these three fields outside the benchmark table. */
export const AA_SCORE_FIELDS = {
  analystAgent: "aa-analyst-agent",
  omniscienceAccuracy: "omniscience-accuracy",
  omniscienceNonHallucination: "omniscience-non-hallucination",
} as const;

/** Every spelling the leaderboard's `scores` object may carry — the benchmark names plus the three above. */
export type LeaderboardScoreField = (typeof AA_SCORE_FIELDS)[keyof typeof AA_SCORE_FIELDS] | LeaderboardScoreKey;

export type LeaderboardScores = Partial<Record<LeaderboardScoreField, unknown>>;

/** One row of the leaderboard's `initialModels` prop, as AA sends it. */
export interface AaLeaderboardRow {
  slug?: unknown;
  name?: unknown;
  shortName?: unknown;
  paramClass?: unknown;
  deprecated?: unknown;
  isReasoning?: unknown;
  isOpenWeights?: unknown;
  modelCreatorName?: unknown;
  modelCreatorColor?: unknown;
  intelligenceIndex?: unknown;
  omniscience?: unknown;
  price1mInputTokens?: unknown;
  price1mOutputTokens?: unknown;
  cacheHitPrice?: unknown;
  cacheWritePrice?: unknown;
  medianOutputTokensPerSecond?: unknown;
  contextWindowTokens?: unknown;
  scores?: unknown;
}

/** One row of the Decision Index page's `contestants` prop. */
export interface AaContestantRow {
  slug?: unknown;
  name?: unknown;
  creatorName?: unknown;
  kind?: unknown;
  indexScore?: unknown;
  costPerTaskUsd?: unknown;
  timePerTaskMs?: unknown;
  scores?: unknown;
}

/**
 * One row of the coding-agent leaderboard, as both `benchmarkRows` and the `rows` array it references spell it.
 *
 * One row per agent × model pairing. The flags a row also carries (`isDefault`, `isHighlighted`, `isUnavailable`) and the
 * per-evaluation blocks (`evals`, `safety`, `rewardHacking`, `percentiles`) are not read: this app mirrors the table the
 * page prints instead of re-deciding which pairings it ranks. Everything read travels in nested objects
 * (`model.shortName`, `agentCreator.name`).
 */
export interface AaCodingAgentRow {
  id?: unknown;
  agentName?: unknown;
  model?: unknown;
  agentCreator?: unknown;
  /** The row's own labels: `display.model` spells the model(s) a router pairing runs (`A + B`). */
  display?: unknown;
  indexScore?: unknown;
}

/** One entry of the leaderboard body's `models` array, which is where the changelog's release links come from. */
export interface AaChangelogRow {
  slug?: unknown;
  name?: unknown;
  releaseSlug?: unknown;
}

/** One entry of the leaderboard body's `releases` array: the release family a model belongs to. */
export interface AaReleaseRow {
  slug?: unknown;
  name?: unknown;
  deprecated?: unknown;
  releaseDate?: unknown;
  creator?: unknown;
}

/** The five columns the Decision Index composites, as its page spells them. */
export interface AaDecisionScores {
  omniscienceAccuracy?: unknown;
  omniscienceNonHallucinationRate?: unknown;
  hleTextMcqAccuracy?: unknown;
  when2callAccuracy?: unknown;
  wildguardtestAverageF1?: unknown;
}

/** The `scores` block of one contestant row. */
export function decisionScoresOf(row: AaContestantRow): AaDecisionScores | undefined {
  return isRecord(row.scores) ? (row.scores as AaDecisionScores) : undefined;
}

/**
 * The changelog's mapped row: identity, the release family it belongs to, and the release's own facts.
 */
export interface ChangelogModel {
  slug: string;
  name: string;
  releaseSlug: string;
  releaseName: string;
  releaseDate: string;
  creatorName: string;
}

/** Copies `field` from one row onto another under its canonical spelling; a row without it is left untouched. */
export function copyField(from: AaRow, to: AaRow, field: string): void {
  const key = presentField(from, field);
  if (key !== undefined) setField(to, field, (from as Record<string, unknown>)[key]);
}

/** The `omniscienceBreakdown` block of one row: AA's own spelling of the three rates. */
export interface AaOmniscienceBreakdown {
  accuracy?: unknown;
  attemptRate?: unknown;
  hallucinationRate?: unknown;
}

export function omniscienceBreakdownOf(row: AaRow): AaOmniscienceBreakdown | undefined {
  return isRecord(row.omniscienceBreakdown) ? (row.omniscienceBreakdown as AaOmniscienceBreakdown) : undefined;
}

/**
 * The eight modality flags, spelled as AA spells them: `inputModalityText` … `outputModalityVideo`.
 *
 * Derived from `MODALITY_KEYS` rather than listed again: the suffix is the key capitalized, so a modality added to
 * the shared enum is a compile error here until its wire name follows, instead of a flag this app never reads.
 */
export type ModalityWireName = `${"input" | "output"}Modality${Capitalize<ModalityKey>}`;

/**
 * Overlays one row's breakdown block onto another's: a field the patch carries wins, an absent one leaves the target's
 * value alone. The merge used to spread the patch over the target, which erased an accuracy the leaderboard had already
 * established whenever the enrichment row carried the block with only some of its fields.
 */
export function overlayBreakdown(target: AaOmniscienceBreakdown, patch: AaOmniscienceBreakdown): void {
  const into = target as Record<string, unknown>;
  for (const [key, value] of Object.entries(patch)) {
    if (value === null || value === undefined || value === "") continue;
    into[key] = value;
  }
}

export const MODALITY_WIRES: readonly {
  readonly key: ModalityKey;
  readonly input: ModalityWireName;
  readonly output: ModalityWireName;
}[] = MODALITY_KEYS.map((key) => ({
  key,
  input: modalityWireName("input", key),
  output: modalityWireName("output", key),
}));

/**
 * The two spellings of one flag. The capitalization is what `ModalityWireName` cannot express at runtime, so it is
 * asserted once here instead of at every read.
 */
function modalityWireName(direction: "input" | "output", key: ModalityKey): ModalityWireName {
  const suffix = key.charAt(0).toUpperCase() + key.slice(1).toLowerCase();
  return `${direction}Modality${suffix}` as ModalityWireName;
}

export const MODALITY_WIRE_NAMES: readonly ModalityWireName[] = MODALITY_WIRES.flatMap((wire) => [
  wire.input,
  wire.output,
]);

/** The three input flags the omniscience page scores; it carries no output modality at all. */
export const OMNISCIENCE_MODALITY_WIRE_NAMES: readonly ModalityWireName[] = [
  "inputModalityImage",
  "inputModalitySpeech",
  "inputModalityVideo",
];

/**
 * One field the upstream spells more than one way across its pages, so a projection list can ask for the concept and
 * get whichever spelling this row carries. `itbenchSre` is the only one today: `/models` capitalizes the B, the
 * omniscience page does not.
 */
const AA_FIELD_ALIASES: Record<string, readonly string[]> = {
  itbenchSre: ["itbenchSre", "itBenchSre"],
};

/** The scalar fields of the normalized row, in the spelling `/models` uses. */
interface AaRowFields {
  id?: unknown;
  slug?: unknown;
  name?: unknown;
  shortName?: unknown;
  creator?: unknown;
  intelligenceIndex?: unknown;
  analystAgent?: unknown;
  isReasoning?: unknown;
  isOpenWeights?: unknown;
  releaseDate?: unknown;
  parameters?: unknown;
  sizeClass?: unknown;
  contextWindowTokens?: unknown;
  price1mInputTokens?: unknown;
  price1mOutputTokens?: unknown;
  cacheHitPrice?: unknown;
  cacheWritePrice?: unknown;
  medianCanonicalAnswerOutputSpeed?: unknown;
  omniscience?: unknown;
  omniscienceBreakdown?: unknown;
  omniscienceHallucinationRate?: unknown;
}

/** The fields whose names are per-entity tables rather than literals: benchmarks and modality flags. */
type AaRowTableFields = Partial<Record<BenchmarkWireName, unknown>> & Partial<Record<ModalityWireName, unknown>>;

/**
 * The normalized AA row: the leaderboard's catalog fields plus whatever the enrichment pages add, one spelling each.
 *
 * A `Record<string, unknown>` is assignable to it (every member is optional and `unknown`), which is what lets a Flight
 * row be handed over without a cast; what it forbids is *writing* a key nothing declares, and *reading* one under a
 * spelling this interface does not have.
 */
export type AaRow = AaRowFields & AaRowTableFields;

/**
 * The spelling of `field` this row carries, or `undefined` when it carries none.
 *
 * Dynamic access has to happen somewhere — a projection list is a list of names — so it happens in these two functions
 * instead of at each call site: the cast is the alias table's promise that the name it returns is a field of this row.
 */
export function presentField(row: AaRow, field: string): string | undefined {
  const aliases = AA_FIELD_ALIASES[field];
  if (aliases === undefined) return field in row ? field : undefined;
  return aliases.find((alias) => alias in row);
}

export function fieldValue(row: AaRow, field: string): unknown {
  const key = presentField(row, field);
  return key === undefined ? undefined : (row as Record<string, unknown>)[key];
}

/** Writes one dynamic field: the tables above are the only keys this is used with. */
export function setField(row: AaRow, field: string, value: unknown): void {
  (row as Record<string, unknown>)[field] = value;
}

/** The `scores` object of one leaderboard row, read as the declared spelling set. */
export function leaderboardScores(row: AaLeaderboardRow): LeaderboardScores | undefined {
  return isRecord(row.scores) ? (row.scores as LeaderboardScores) : undefined;
}

/**
 * A leaderboard row is usable only if it carries the index the ranking is ordered by: the `initialModels` prop also
 * carries the page's legend and changelog snapshots, and one of those came back as the row source the day `findNextData`
 * picked the first array.
 */
export function isLeaderboardRow(row: Record<string, unknown>): row is Record<string, unknown> & AaLeaderboardRow {
  return "intelligenceIndex" in row;
}

/** The creator record a normalized row carries: AA sends `{ name, color }` or nothing. */
export function creatorOf(row: AaRow): { name: string; color: string } {
  const creator = isRecord(row.creator) ? row.creator : undefined;
  return { name: creator ? text(creator.name) : "", color: creator ? text(creator.color) : "" };
}
