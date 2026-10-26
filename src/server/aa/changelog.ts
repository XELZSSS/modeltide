import type { AppContext } from "@/server/api/context";
import { served, type ServedPayload } from "@/server/served-payload";
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
export async function getChangelogModels(ctx: AppContext): Promise<ServedPayload<ChangelogModel[]>> {
  const body = await getAaLeaderboardBody(ctx);
  // Parsed order, not date order: `toClosedReleases` sorts the rows it emits, and this array has no other reader.
  const models = requireParsed(parseChangelogModels(body.payload.data), ctx.log, "aa-changelog");
  ctx.log("info", `[artificial] changelog derived from the cached leaderboard body (models=${models.length})`);
  // The derived rows are not the bytes the leaderboard entry stored, so no body travels; only its timestamp does, which
  // is what keeps this view's ETag tied to the payload it was derived from.
  return served({ data: models, partial: body.payload.partial }, { producedAt: body.producedAt });
}
