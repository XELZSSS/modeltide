import { byDateDesc } from "@/server/parsers/parser-primitives";
import type { AppContext } from "@/server/context";
import { ClientAbortError } from "@/server/infra/errors";
import { parseChangelogModels, type ChangelogModel } from "@/server/parsers/aa/changelog-parser";
import { getAaLeaderboardBody } from "@/server/sources/aa/index-source";
import { requireParsed } from "@/server/sources/pipeline";
import { errMsg } from "@/server/infra/task-pool";

export interface ChangelogModels {
  models: ChangelogModel[];
  degraded: boolean;
}

function newestFirst(models: ChangelogModel[]): ChangelogModel[] {
  return models.sort(byDateDesc((m) => m.releaseDate));
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
