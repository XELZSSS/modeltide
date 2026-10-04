import { isRecord, numCoerce, str } from "@/server/parsers/parser-primitives";
import {
  collectModelReleaseLinksFromArrays,
  scanReleaseIndex,
  type ReleaseInfo,
} from "@/server/parsers/aa/release-index";
import { BENCHMARK_FIELD_OVERRIDES } from "@/server/parsers/aa/model-compact";
import { BENCHMARK_KEYS } from "@/shared/config";
import { parseFail, parseOk, type ParseResult } from "@/server/parsers/parse-result";

const BENCHMARK_WIRE_NAMES = BENCHMARK_KEYS.map((key) => BENCHMARK_FIELD_OVERRIDES[key] ?? key);

function hallucinationRate(nonHallucination: unknown): number | null {
  const value = numCoerce(nonHallucination);
  return value == null ? null : 1 - value;
}

function normalizeRow(
  row: Record<string, unknown>,
  releases: Map<string, ReleaseInfo>,
  links: Map<string, string>,
): Record<string, unknown> | null {
  const slug = str(row.slug).trim();
  const name = str(row.name).trim();
  if (!slug || !name || row.deprecated === true) return null;
  const releaseSlug = links.get(slug);
  const release = releaseSlug ? releases.get(releaseSlug) : undefined;
  const normalized: Record<string, unknown> = {
    slug,
    name,
    isReasoning: row.isReasoning,
    isOpenWeights: row.isOpenWeights,
    creator: { name: str(row.modelCreatorName), color: str(row.modelCreatorColor) },
    intelligenceIndex: row.intelligenceIndex,
    intelligenceIndexIsEstimated: row.intelligenceIndexIsEstimated,
    omniscience: row.omniscience,
    omniscienceBreakdown: {
      accuracy: row.omniscienceAccuracy,
      hallucinationRate: hallucinationRate(row.omniscienceNonHallucination),
    },
    price1mInputTokens: row.price1mInputTokens,
    price1mOutputTokens: row.price1mOutputTokens,
    cacheHitPrice: row.cacheHitPrice,
    cacheWritePrice: row.cacheWritePrice,
    medianCanonicalAnswerOutputSpeed: row.medianOutputTokensPerSecond,
  };
  const shortName = str(row.shortName).trim();
  if (shortName) normalized.shortName = shortName;
  const sizeClass = str(row.paramClass).trim();
  if (sizeClass) normalized.sizeClass = sizeClass;
  if (release) normalized.releaseDate = release.releaseDate;
  for (const wire of BENCHMARK_WIRE_NAMES) {
    if (wire in row) normalized[wire] = row[wire];
  }
  return normalized;
}

export function parseLeaderboardModels(html: unknown): ParseResult<Record<string, unknown>[]> {
  if (typeof html !== "string" || !html) return parseFail("AA leaderboard page is not a string");
  const { releases, modelArrays } = scanReleaseIndex(html);
  const links = collectModelReleaseLinksFromArrays(modelArrays);
  let best: Record<string, unknown>[] = [];
  let bestRaw = 0;
  for (const value of modelArrays) {
    if (!Array.isArray(value)) continue;
    const rows = value as unknown[];
    if (rows.length === 0 || !isRecord(rows[0]) || !("intelligenceIndex" in rows[0])) continue;
    const kept = rows
      .map((raw) => (isRecord(raw) ? normalizeRow(raw, releases, links) : null))
      .filter((row): row is Record<string, unknown> => row !== null);
    if (kept.length > best.length) {
      best = kept;
      bestRaw = rows.length;
    }
  }
  if (best.length === 0) return parseFail("AA leaderboard page yielded no usable model rows");
  const dropped = bestRaw - best.length;
  return parseOk(best, dropped > 0 ? [`Skipped ${dropped} deprecated leaderboard rows`] : []);
}
