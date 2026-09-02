import type { AppContext } from "@/server/context";
import { DEFAULT_TTL_MS, cacheKeys } from "@/shared/config";
import type { TextToImageModel, TextToImagePayload } from "@/shared/types";
import { findLongestData, findNextData, parseRscPayload } from "@/server/parsers/rsc";
import { UpstreamError, errMsg } from "@/server/infra/errors";
import { dedupeBy, isFiniteNumber, toStringOrNull } from "@/shared/utils";
import { num, numNonNegative } from "@/server/parsers/primitives";
import { isValidTextToImageEntry } from "@/server/sources/data-filter";
import { fetchAaRsc } from "@/server/sources/aa/fetch";

const intOrNull = (v: unknown): number | null => {
  const n = num(v);
  return n == null ? null : Math.trunc(n);
};

interface RawElo {
  elo?: unknown;
  ciDelta?: unknown;
  appearances?: unknown;
  wins?: unknown;
  winRate?: unknown;
  tag?: unknown;
}

export interface RawEntry {
  id?: unknown;
  slug?: unknown;
  name?: unknown;
  pricePer1kImages?: unknown;
  overallElo?: unknown;
  overallRank?: unknown;
  elos?: unknown;
  creator?: unknown;
}

export function mapEntry(raw: RawEntry): TextToImageModel | null {
  const id = toStringOrNull(raw.id);
  const slug = toStringOrNull(raw.slug);
  const name = toStringOrNull(raw.name);

  const rank = isFiniteNumber(raw.overallRank) && raw.overallRank > 0 ? Math.trunc(raw.overallRank) : null;

  const elos = Array.isArray(raw.elos) ? (raw.elos as RawElo[]) : [];
  const overallEloEntry =
    elos.find((e) => e != null && typeof e === "object" && (e as Record<string, unknown>).tag == null) ??
    elos.find((e) => e != null && typeof e === "object") ??
    null;

  let elo: number | null = null;
  let ciDelta: number | null = null;
  let appearances: number | null = null;
  let winRate: number | null = null;

  if (overallEloEntry) {
    elo = num(overallEloEntry.elo);
    ciDelta = num(overallEloEntry.ciDelta);
    appearances = intOrNull(overallEloEntry.appearances);
    winRate = num(overallEloEntry.winRate);
  }

  if (elo == null && isFiniteNumber(raw.overallElo)) elo = raw.overallElo as number;
  if (!isValidTextToImageEntry({ id, slug, name, rank, elo })) return null;
  const validId = id as string;
  const validSlug = slug as string;
  const validName = name as string;
  const validRank = rank as number;
  const validElo = elo as number;

  const pricePer1kImages = numNonNegative(raw.pricePer1kImages);
  const creator = raw.creator as Record<string, unknown> | null | undefined;

  return {
    id: validId,
    slug: validSlug,
    name: validName.trim(),
    rank: validRank,
    elo: validElo,
    eloLower: ciDelta != null ? validElo - ciDelta : null,
    eloUpper: ciDelta != null ? validElo + ciDelta : null,
    appearances,
    winRate,
    pricePer1kImages,
    creatorName: creator ? toStringOrNull(creator.name) : null,
  };
}

export const TEXT_TO_IMAGE_PATH = "/image/models";

export const getTextToImageLeaderboard = (ctx: AppContext): Promise<TextToImagePayload> =>
  ctx.cache.withTtl(cacheKeys.textToImage, DEFAULT_TTL_MS, async () => {
    let body: string;
    try {
      body = await fetchAaRsc(ctx, TEXT_TO_IMAGE_PATH);
    } catch (err) {
      throw new UpstreamError(`Text-to-image fetch failed: ${errMsg(err)}`);
    }
    if (!body) {
      throw new UpstreamError("Text-to-image returned an empty body");
    }
    let rawModels: Record<string, unknown>[] | null = null;
    try {
      rawModels = parseRscPayload<Record<string, unknown>>(
        body,
        "textToImage",
        (tree) => findLongestData(tree, "textToImage") ?? findNextData(tree, "textToImage"),
      );
    } catch {
      rawModels = null;
    }
    if (!rawModels || rawModels.length === 0) {
      throw new UpstreamError(`Text-to-image yielded 0 raw rows (raw=0, kept=0, body=${body.length}B)`);
    }
    const mapped = rawModels.map((m) => mapEntry(m as RawEntry)).filter((m): m is TextToImageModel => m !== null);
    const models = dedupeBy(
      [...mapped].sort((a, b) => (b.elo ?? -Infinity) - (a.elo ?? -Infinity)),
      (m) => m.slug,
    ).sort((a, b) => a.rank - b.rank);
    if (models.length === 0) {
      throw new UpstreamError(`Text-to-image yielded 0 models (raw=${rawModels.length}, kept=0)`);
    }
    return { data: { models, fetchedAt: new Date().toISOString() } };
  });
