import { isRecord, numCoerce, str, text } from "@/server/formats/scalars";
import { mapRows } from "@/server/formats/parse-rows";
import { collectModelReleaseLinksFromArrays, scanReleaseIndex, type ReleaseInfo } from "./release-index";
import { benchmarkWireName, LEADERBOARD_BENCHMARK_KEYS, LEADERBOARD_SCORE_KEYS } from "./benchmark-fields";
import { parseFail, parseOk, type ParseResult } from "@/server/formats/parse-result";
import { findLongestData } from "@/server/formats/rsc-data";
import { parseRscPayload } from "@/server/formats/rsc-parser";
import type { BenchmarkKey } from "@/shared/config";
import { AA_FLIGHT_MARKERS } from "../markers";
import { AA_SCORE_FIELDS, setField, type AaLeaderboardRow, type AaRow, type LeaderboardScores } from "../wire";
import { isLeaderboardRow, leaderboardScores } from "../wire-read";

function hallucinationRate(nonHallucination: unknown): number | null {
  const value = numCoerce(nonHallucination);
  return value == null ? null : 1 - value;
}

/** One benchmark value for a leaderboard row: most live in `scores` under the upstream's kebab-case name, and the signed omniscience index is the one field at the top level. */
function benchmarkValue(row: AaLeaderboardRow, scores: LeaderboardScores | undefined, key: BenchmarkKey): unknown {
  const scoreKey = LEADERBOARD_SCORE_KEYS[key];
  return scoreKey === undefined ? row.omniscience : scores?.[scoreKey];
}

/** Files the row's benchmark values under their wire names, noting every key the row carried: `seenKeys` is what the "omitted benchmark wire name(s)" warning is built from. */
function addBenchmarkValues(
  into: AaRow,
  row: AaLeaderboardRow,
  scores: LeaderboardScores | undefined,
  seenKeys: Set<BenchmarkKey>,
): void {
  for (const key of LEADERBOARD_BENCHMARK_KEYS) {
    const value = benchmarkValue(row, scores, key);
    if (value === undefined) continue;
    seenKeys.add(key);
    setField(into, benchmarkWireName(key), value);
  }
}

/** Maps one leaderboard row onto `AaRow`: the upstream's spellings (`modelCreatorName`, `scores[…kebab…]`) are translated here and nowhere else. One literal per row, grouped by concern, since `AaRow`'s members are optional and a group spread here would pay a scratch object per row (272 a refresh). */
function normalizeRow(
  row: AaLeaderboardRow,
  releases: Map<string, ReleaseInfo>,
  links: Map<string, string>,
  seenKeys: Set<BenchmarkKey>,
): AaRow | null {
  const slug = text(row.slug);
  const name = text(row.name);
  if (!slug || !name || row.deprecated === true) return null;
  const releaseSlug = links.get(slug);
  const release = releaseSlug ? releases.get(releaseSlug) : undefined;
  const scores = leaderboardScores(row);
  const normalized: AaRow = {
    slug,
    name,
    isReasoning: row.isReasoning,
    isOpenWeights: row.isOpenWeights,
    creator: { name: str(row.modelCreatorName), color: str(row.modelCreatorColor) },
    intelligenceIndex: row.intelligenceIndex,
    analystAgent: scores?.[AA_SCORE_FIELDS.analystAgent],
    omniscience: row.omniscience,
    omniscienceBreakdown: {
      accuracy: scores?.[AA_SCORE_FIELDS.omniscienceAccuracy],
      hallucinationRate: hallucinationRate(scores?.[AA_SCORE_FIELDS.omniscienceNonHallucination]),
    },
    price1mInputTokens: row.price1mInputTokens,
    price1mOutputTokens: row.price1mOutputTokens,
    cacheHitPrice: row.cacheHitPrice,
    cacheWritePrice: row.cacheWritePrice,
    outputSpeed: row.outputSpeed,
    contextWindowTokens: row.contextWindowTokens,
  };
  const shortName = text(row.shortName);
  if (shortName) normalized.shortName = shortName;
  const sizeClass = text(row.paramClass);
  if (sizeClass) normalized.sizeClass = sizeClass;
  if (release) normalized.releaseDate = release.releaseDate;
  addBenchmarkValues(normalized, row, scores, seenKeys);
  return normalized;
}

export function parseLeaderboardModels(html: unknown): ParseResult<AaRow[]> {
  if (typeof html !== "string" || !html) return parseFail("AA leaderboard page is not a string");
  const { releases, modelArrays, unparsableSlices } = scanReleaseIndex(html);
  const links = collectModelReleaseLinksFromArrays(modelArrays);
  const seenKeys = new Set<BenchmarkKey>();
  const prop = parseRscPayload<unknown[]>(html, AA_FLIGHT_MARKERS.models, (tree) =>
    findLongestData(tree, AA_FLIGHT_MARKERS.models, (row) => isRecord(row) && isLeaderboardRow(row)),
  );
  // `parseRscPayload` only answers `ok` with a non-empty array, so an empty read is a parse failure, not a payload.
  // The array it picks is the longest one whose first row passes `isLeaderboardRow`.
  if (!prop.ok) return parseFail(prop.error);
  const { rows: kept, dropped } = mapRows(prop.data, (raw) => normalizeRow(raw, releases, links, seenKeys));
  if (kept.length === 0) return parseFail("AA leaderboard page yielded no usable model rows");
  const missing = LEADERBOARD_BENCHMARK_KEYS.filter((key) => !seenKeys.has(key));
  const warnings: string[] = [];
  // `dropped` counts every row `mapRows` rejected, not only the deprecated ones: a row with no slug or name lands in the
  // same total, so the warning names the cause it actually aggregates.
  if (dropped > 0) warnings.push(`Skipped ${dropped} unusable leaderboard rows (deprecated or without an identity)`);
  if (missing.length > 0)
    warnings.push(`Leaderboard omitted ${missing.length} benchmark wire name(s): ${missing.join(", ")}`);
  // A slice the needle scan could not parse is reported, not swallowed: a payload carrying fewer arrays than it should
  // is the failure this warning exists for.
  if (unparsableSlices > 0) warnings.push(`Leaderboard had ${unparsableSlices} unparsable JSON slice(s)`);
  return parseOk(kept, warnings);
}
