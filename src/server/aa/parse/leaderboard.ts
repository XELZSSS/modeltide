import { isRecord, numCoerce, str, text } from "@/server/formats/scalars";
import { mapRows } from "@/server/formats/parse-rows";
import { collectModelReleaseLinksFromArrays, scanReleaseIndex, type ReleaseInfo } from "./release-index";
import { benchmarkWireName, LEADERBOARD_BENCHMARK_KEYS, LEADERBOARD_SCORE_KEYS } from "./benchmark-fields";
import { parseFail, parseOk, type ParseResult } from "@/server/formats/parse-result";
import { findNextData } from "@/server/formats/rsc-data";
import { parseRscPayload } from "@/server/formats/rsc-parser";
import type { BenchmarkKey } from "@/shared/config";
import { AA_FLIGHT_MARKERS } from "../markers";
import {
  AA_SCORE_FIELDS,
  isLeaderboardRow,
  leaderboardScores,
  setField,
  type AaLeaderboardRow,
  type AaRow,
  type LeaderboardScores,
} from "../wire";

function hallucinationRate(nonHallucination: unknown): number | null {
  const value = numCoerce(nonHallucination);
  return value == null ? null : 1 - value;
}

/**
 * One benchmark value for a leaderboard row. Most live in `scores` under the upstream's kebab-case evaluation name;
 * the signed omniscience index is the one field that stays at the top level, so it is the one key
 * `LEADERBOARD_SCORE_KEYS` has no entry for.
 */
function benchmarkValue(row: AaLeaderboardRow, scores: LeaderboardScores | undefined, key: BenchmarkKey): unknown {
  const scoreKey = LEADERBOARD_SCORE_KEYS[key];
  return scoreKey === undefined ? row.omniscience : scores?.[scoreKey];
}

/**
 * Maps one leaderboard row onto `AaRow`: the field names this stack reads downstream are the ones the upstream sends,
 * so the leaderboard's own spellings (`modelCreatorName`, `scores[…kebab…]`) are translated here and nowhere else.
 */
function normalizeRow(
  row: AaLeaderboardRow,
  releases: Map<string, ReleaseInfo>,
  links: Map<string, string>,
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
  for (const key of LEADERBOARD_BENCHMARK_KEYS) {
    const value = benchmarkValue(row, scores, key);
    if (value !== undefined) setField(normalized, benchmarkWireName(key), value);
  }
  return normalized;
}

export function parseLeaderboardModels(html: unknown): ParseResult<AaRow[]> {
  if (typeof html !== "string" || !html) return parseFail("AA leaderboard page is not a string");
  const { releases, modelArrays, unparsableSlices } = scanReleaseIndex(html);
  const links = collectModelReleaseLinksFromArrays(modelArrays);
  const prop = parseRscPayload<unknown[]>(html, AA_FLIGHT_MARKERS.models, (tree) =>
    findNextData(tree, AA_FLIGHT_MARKERS.models),
  );
  // `parseRscPayload` only answers `ok` with a non-empty array, so what used to be read as "an empty list" is a parse
  // failure and belongs in the error, not in a payload that then reported "no usable model rows" for either cause.
  if (!prop.ok) return parseFail(prop.error);
  const rows = prop.data;
  if (!rows.some((raw) => isRecord(raw) && isLeaderboardRow(raw))) {
    return parseFail("AA leaderboard page yielded no usable model rows");
  }
  const seenKeys = new Set<BenchmarkKey>();
  const { rows: kept, dropped } = mapRows(rows, (raw) => {
    const scores = leaderboardScores(raw);
    for (const key of LEADERBOARD_BENCHMARK_KEYS) {
      if (benchmarkValue(raw, scores, key) !== undefined) seenKeys.add(key);
    }
    return normalizeRow(raw, releases, links);
  });
  if (kept.length === 0) return parseFail("AA leaderboard page yielded no usable model rows");
  const missing = LEADERBOARD_BENCHMARK_KEYS.filter((key) => !seenKeys.has(key));
  const warnings: string[] = [];
  // `dropped` counts every row `mapRows` rejected, not only the deprecated ones: a row with no slug or name is dropped by
  // `normalizeRow` and lands in the same total, so the warning names the cause it actually aggregates.
  if (dropped > 0) warnings.push(`Skipped ${dropped} unusable leaderboard rows (deprecated or without an identity)`);
  if (missing.length > 0)
    warnings.push(`Leaderboard omitted ${missing.length} benchmark wire name(s): ${missing.join(", ")}`);
  // A slice the needle scan could not parse is reported, not swallowed: the arrays that did parse still build the
  // ranking, but a payload carrying fewer of them than it should is exactly what a silent `catch` used to hide.
  if (unparsableSlices > 0) warnings.push(`Leaderboard had ${unparsableSlices} unparsable JSON slice(s)`);
  return parseOk(kept, warnings);
}
