import { isRecord, numCoerce, str } from "@/server/formats/parser-primitives";
import { collectModelReleaseLinksFromArrays, scanReleaseIndex, type ReleaseInfo } from "./release-index";
import { leaderboardBenchmarkWireNames, presentAlias } from "./model-compact";
import { parseFail, parseOk, type ParseResult } from "@/server/formats/parse-result";
import { findNextData, parseRscPayload } from "@/server/formats/rsc-parser";

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
  for (const wire of leaderboardBenchmarkWireNames) {
    const alias = presentAlias(row, wire);
    if (alias !== undefined) normalized[wire] = row[alias];
  }
  return normalized;
}

/** Model matrix is the `initialModels` RSC prop; the `"models"` array holds only ids. */
export function parseLeaderboardModels(html: unknown): ParseResult<Record<string, unknown>[]> {
  if (typeof html !== "string" || !html) return parseFail("AA leaderboard page is not a string");
  const { releases, modelArrays } = scanReleaseIndex(html);
  const links = collectModelReleaseLinksFromArrays(modelArrays);
  const prop = parseRscPayload<unknown[]>(html, "initialModels", (tree) => findNextData(tree, "initialModels"));
  const rows = prop.ok && Array.isArray(prop.data) ? prop.data : [];
  if (rows.length === 0 || !rows.some((raw) => isRecord(raw) && "intelligenceIndex" in raw)) {
    return parseFail("AA leaderboard page yielded no usable model rows");
  }
  // Track seen wire names so an upstream rename surfaces as a warning, not blank columns.
  const seenWire = new Set<string>();
  const kept: Record<string, unknown>[] = [];
  for (const raw of rows) {
    if (!isRecord(raw)) continue;
    for (const wire of leaderboardBenchmarkWireNames) {
      if (presentAlias(raw, wire) !== undefined) seenWire.add(wire);
    }
    const normalized = normalizeRow(raw, releases, links);
    if (normalized !== null) kept.push(normalized);
  }
  if (kept.length === 0) return parseFail("AA leaderboard page yielded no usable model rows");
  const dropped = rows.length - kept.length;
  const missing = leaderboardBenchmarkWireNames.filter((wire) => !seenWire.has(wire));
  const warnings: string[] = [];
  if (dropped > 0) warnings.push(`Skipped ${dropped} deprecated leaderboard rows`);
  if (missing.length > 0)
    warnings.push(`Leaderboard omitted ${missing.length} benchmark wire name(s): ${missing.join(", ")}`);
  return parseOk(kept, warnings);
}
