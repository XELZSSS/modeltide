import { sortByDateDesc } from "@/server/formats/dates";
import type { AppContext } from "@/server/api/context";
import { errMsg, rethrowIfClientAbort } from "@/server/api/errors";
import type { SourcePayload } from "@/shared/types";
import { parseChangelogModels, type ChangelogModel } from "./parse/changelog";
import { getAaLeaderboardBody } from "./index";
import { requireParsed } from "@/server/pipeline";

function newestFirst(models: ChangelogModel[]): ChangelogModel[] {
  return sortByDateDesc(models, (m) => m.releaseDate);
}

/**
 * A derived view over the cached leaderboard body, so it has no cache entry of its own. It still answers the common
 * source shape, which keeps every leg of the releases fan-out interchangeable.
 */
export async function getChangelogModels(ctx: AppContext): Promise<SourcePayload<ChangelogModel[]>> {
  try {
    const body = await getAaLeaderboardBody(ctx);
    const models = newestFirst(requireParsed(parseChangelogModels(body.data), ctx.log, "aa-changelog"));
    ctx.log("info", `[artificial] changelog derived from the cached leaderboard body (models=${models.length})`);
    return { data: models, fetchedAt: body.fetchedAt, partial: body.partial };
  } catch (err) {
    rethrowIfClientAbort(err);
    ctx.log("warn", `[artificial] changelog leaderboard-body read failed: ${errMsg(err)}`);
    return { data: [], fetchedAt: new Date().toISOString(), partial: true };
  }
}
