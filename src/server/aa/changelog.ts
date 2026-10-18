import { sortByDateDesc } from "@/server/formats/parser-primitives";
import type { AppContext } from "@/server/api/context";
import { ClientAbortError, errMsg } from "@/server/api/errors";
import { parseChangelogModels, type ChangelogModel } from "./parse/changelog";
import { getAaLeaderboardBody } from "./index";
import { requireParsed } from "@/server/pipeline";

interface ChangelogModels {
  models: ChangelogModel[];
  degraded: boolean;
}

function newestFirst(models: ChangelogModel[]): ChangelogModel[] {
  return sortByDateDesc(models, (m) => m.releaseDate);
}

export async function getChangelogModels(ctx: AppContext): Promise<ChangelogModels> {
  try {
    const body = await getAaLeaderboardBody(ctx);
    const models = newestFirst(requireParsed(parseChangelogModels(body.value), ctx.log, "aa-changelog"));
    ctx.log("info", `[artificial] changelog derived from the cached leaderboard body (models=${models.length})`);
    return { models, degraded: body.degraded };
  } catch (err) {
    if (err instanceof ClientAbortError) throw err;
    ctx.log("warn", `[artificial] changelog leaderboard-body read failed: ${errMsg(err)}`);
    return { models: [], degraded: true };
  }
}
