import { ARENA_BOARD_IDS, SLOW_TTL_MS } from "@/shared/config";
import { MAX_FEED_BYTES, UPSTREAM_FETCH_OPTS, cacheKeys, upstreamConfig } from "@/server/config";
import type { ArenaRankEntry, ArenaRankingsPayload } from "@/shared/types";
import type { AppContext } from "@/server/context";
import { UpstreamError, ValidationError } from "@/server/infra/errors";
import { num, isRecord } from "@/server/parsers/primitives";
import { findNextData, parseRscPayload } from "@/server/parsers/rsc";
import { dedupeBy, toStringOrNull } from "@/shared/utils";
import { isUnsuitableContent } from "@/server/sources/data-filter";

const LEADERBOARD_PATH = "/leaderboard/text";
const MAX_ROWS = 300;

interface ArenaRscEntry {
  rank: number;
  modelKey: string;
  modelDisplayName: string | null;
  rating: number;
  votes: number | null;
  modelOrganization: string | null;
  inputPricePerMillion: number | null;
  outputPricePerMillion: number | null;
  contextLength: number | null;
}

function toArenaRscEntry(e: unknown): ArenaRscEntry | null {
  if (!isRecord(e)) return null;
  const rank = num(e.rank);
  const modelKey = toStringOrNull(e.modelKey);
  const rating = num(e.rating);
  if (rank == null || modelKey == null || rating == null) return null;
  if (isUnsuitableContent(modelKey)) return null;
  return {
    rank,
    modelKey,
    modelDisplayName: toStringOrNull(e.modelDisplayName),
    rating,
    votes: num(e.votes),
    modelOrganization: toStringOrNull(e.modelOrganization),
    inputPricePerMillion: num(e.inputPricePerMillion),
    outputPricePerMillion: num(e.outputPricePerMillion),
    contextLength: num(e.contextLength),
  };
}

function mapArenaRscEntry(e: ArenaRscEntry): ArenaRankEntry {
  const name = e.modelDisplayName ?? e.modelKey;
  return {
    rank: Math.trunc(e.rank),
    id: e.modelKey,
    name,
    creator: e.modelOrganization ?? "Unknown",
    score: e.rating,
    votes: e.votes == null ? null : Math.trunc(e.votes),
    preliminary: false,
    priceInput: e.inputPricePerMillion,
    priceOutput: e.outputPricePerMillion,
    contextTokens: e.contextLength == null ? null : Math.trunc(e.contextLength),
  };
}

function extractArenaRscEntries(tree: unknown): ArenaRscEntry[] | null {
  const arr = findNextData<unknown>(tree, "entries");
  if (!Array.isArray(arr)) return null;
  const rows = arr.map(toArenaRscEntry).filter((e): e is ArenaRscEntry => e != null);
  return rows.length > 0 ? rows : null;
}

export function parseArenaRscBoard(body: string): ArenaRankEntry[] {
  const validated = parseRscPayload<ArenaRscEntry>(body, "entries", extractArenaRscEntries);
  const rows = validated.map(mapArenaRscEntry);
  const sortKey = (r: ArenaRankEntry): number => (r.rank === 0 ? Number.POSITIVE_INFINITY : r.rank);
  rows.sort((a, b) => sortKey(a) - sortKey(b));
  return dedupeBy(rows, (entry) => entry.id).slice(0, MAX_ROWS);
}

async function fetchArenaBoard(ctx: AppContext, category: string): Promise<ArenaRankEntry[]> {
  const path = category === "overall" ? LEADERBOARD_PATH : `${LEADERBOARD_PATH}/${category}`;
  const body = await ctx.http.text(
    `${upstreamConfig.arena}${path}`,
    { headers: { RSC: "1", accept: "*/*" }, ...UPSTREAM_FETCH_OPTS },
    MAX_FEED_BYTES,
  );
  const entries = parseArenaRscBoard(body);
  if (entries.length === 0) {
    throw new UpstreamError(
      `Arena board "${category}" yielded 0 rows from the flight payload (body=${body.length}B, markup changed?)`,
    );
  }
  const scoreless = entries.filter((e) => e.score == null).length;
  if (scoreless > entries.length / 2) {
    ctx.log("warn", `[arena] board "${category}" scoreless ${scoreless}/${entries.length} (payload drift?)`);
  }
  return entries;
}

export const getArenaRankings = (ctx: AppContext): Promise<ArenaRankingsPayload> =>
  ctx.cache.withTtl(cacheKeys.arenaRankings, SLOW_TTL_MS, async () => {
    const entries = await fetchArenaBoard(ctx, "overall");
    return { data: { entries, fetchedAt: new Date().toISOString() } };
  });

export const getArenaBoard = (
  ctx: AppContext,
  category: string,
): Promise<{ category: string; entries: ArenaRankEntry[]; fetchedAt: string }> =>
  ctx.cache.withTtl(cacheKeys.arenaBoard(category), SLOW_TTL_MS, async () => {
    if (!(ARENA_BOARD_IDS as readonly string[]).includes(category)) {
      throw new ValidationError(`Unknown arena board "${category}"`);
    }
    const entries = await fetchArenaBoard(ctx, category);
    return { data: { category, entries, fetchedAt: new Date().toISOString() } };
  });
