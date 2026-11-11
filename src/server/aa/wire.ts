import { MODALITY_KEYS, type ModalityKey } from "@/shared/config";
import type { BenchmarkWireName, LeaderboardScoreKey } from "./parse/benchmark-fields";

/**
 * Artificial Analysis' wire contract: the shapes the upstream sends and the names it sends them under. The page rows
 * spell field names as AA sends them and keep every member `unknown` — a Flight body is a trust boundary; `AaRow` is the
 * normalized spelling every reader downstream speaks, and `ChangelogModel` the changelog's mapped output.
 */

/** The three `scores` fields outside the benchmark table. */
export const AA_SCORE_FIELDS = {
  analystAgent: "aa-analyst-agent",
  omniscienceAccuracy: "omniscience-accuracy",
  omniscienceNonHallucination: "omniscience-non-hallucination",
} as const;

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
  /** The median output speed, which AA spells `outputSpeed` on every page that carries it. */
  outputSpeed?: unknown;
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

/** One row of the coding-agent leaderboard, as both `benchmarkRows` and the `rows` array spell it: one row per agent × model pairing, read through nested objects. */
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

/** The two names the row gates in `wire-read.ts` test for; `satisfies keyof` ties each to its interface, so a rename fails the build. */
export const AA_ROW_GATES = {
  leaderboardIndex: "intelligenceIndex" satisfies keyof AaLeaderboardRow,
  releaseLink: "releaseSlug" satisfies keyof AaChangelogRow,
} as const;

/** The Decision Index's score block, as its page spells it: every member is a 0-100 percentage point. */
export interface AaDecisionScores {
  omniscienceAccuracy?: unknown;
  omniscienceNonHallucinationRate?: unknown;
  omniscienceDecisionScore?: unknown;
  hleAccuracy?: unknown;
  hleNonHallucinationRate?: unknown;
  hleDecisionScore?: unknown;
  when2callAccuracy?: unknown;
  when2callDecisionScore?: unknown;
  evalsafeOnetAccuracy?: unknown;
  evalsafeOnetDecisionScore?: unknown;
  documentDecisionAllPassRate?: unknown;
  documentDecisionDecisionScore?: unknown;
  invarianceAllPassRate?: unknown;
  invarianceSymmetry?: unknown;
}

/** The changelog's mapped row: identity, release family, and the release's own facts. */
export interface ChangelogModel {
  slug: string;
  name: string;
  releaseSlug: string;
  releaseName: string;
  releaseDate: string;
  creatorName: string;
}

/** The `omniscienceBreakdown` block of one row: AA's own spelling of the three rates. */
export interface AaOmniscienceBreakdown {
  accuracy?: unknown;
  attemptRate?: unknown;
  hallucinationRate?: unknown;
}

/** The eight modality flags as AA spells them (`inputModalityText` … `outputModalityVideo`), the suffix being the key capitalized, so a new `MODALITY_KEYS` entry is a compile error until its wire name follows. */
export type ModalityWireName = `${"input" | "output"}Modality${Capitalize<ModalityKey>}`;

export const MODALITY_WIRES: readonly {
  readonly key: ModalityKey;
  readonly input: ModalityWireName;
  readonly output: ModalityWireName;
}[] = MODALITY_KEYS.map((key) => ({
  key,
  input: modalityWireName("input", key),
  output: modalityWireName("output", key),
}));

/** The capitalization `ModalityWireName` cannot express at runtime, so it is asserted once here. */
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

/** A field the upstream spells more than one way: `/models` capitalizes the B in `itbenchSre`, omniscience does not. */
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
  outputSpeed?: unknown;
  omniscience?: unknown;
  omniscienceBreakdown?: unknown;
  omniscienceHallucinationRate?: unknown;
}

/** The fields whose names are per-entity tables rather than literals: benchmarks and modality flags. */
type AaRowTableFields = Partial<Record<BenchmarkWireName, unknown>> & Partial<Record<ModalityWireName, unknown>>;

/** The normalized AA row: one spelling each, every member optional and `unknown`, so a `Record<string, unknown>` is assignable to it without a cast. */
export type AaRow = AaRowFields & AaRowTableFields;

/** The spelling of `field` this row carries, or `undefined` when it carries none; dynamic access happens in this file's four accessors. */
export function presentField(row: AaRow, field: string): string | undefined {
  const aliases = AA_FIELD_ALIASES[field];
  if (aliases === undefined) return field in row ? field : undefined;
  return aliases.find((alias) => alias in row);
}

export function fieldValue(row: AaRow, field: string): unknown {
  const key = presentField(row, field);
  return key === undefined ? undefined : (row as Record<string, unknown>)[key];
}

export function setField(row: AaRow, field: string, value: unknown): void {
  (row as Record<string, unknown>)[field] = value;
}

/** Copies `field` from one row onto another under its canonical spelling; a row without it is left untouched. */
export function copyField(from: AaRow, to: AaRow, field: string): void {
  const key = presentField(from, field);
  if (key !== undefined) setField(to, field, (from as Record<string, unknown>)[key]);
}
