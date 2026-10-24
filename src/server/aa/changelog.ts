import type { AppContext } from "@/server/api/context";
import type { SourcePayload } from "@/shared/types";
import { parseChangelogModels, type ChangelogModel } from "./parse/changelog";
import { getAaLeaderboardBody } from "./index";
import { requireParsed } from "@/server/pipeline";

/**
 * A derived view over the cached leaderboard body, so it has no cache entry of its own; it still answers the common
 * source shape, which keeps every leg of the releases fan-out interchangeable.
 *
 * A failure propagates instead of collapsing into an empty array: the releases fan-out logs the leg with its reason and
 * falls back to the index, so a persistent changelog outage stays visible instead of looking like "no releases today".
 */
export async function getChangelogModels(ctx: AppContext): Promise<SourcePayload<ChangelogModel[]>> {
  const body = await getAaLeaderboardBody(ctx);
  // Parsed order, not date order: `toClosedReleases` sorts the rows it emits, and this array has no other reader.
  const models = requireParsed(parseChangelogModels(body.data), ctx.log, "aa-changelog");
  ctx.log("info", `[artificial] changelog derived from the cached leaderboard body (models=${models.length})`);
  return { data: models, fetchedAt: body.fetchedAt, partial: body.partial };
}
