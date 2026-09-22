import { byDateDesc } from "@/server/parsers/parser-primitives";
import type { AppContext } from "@/server/context";
import { STATIC_TTL_MS } from "@/shared/config";
import { MAX_FEED_BYTES, UPSTREAM_FETCH_OPTS, cacheKeys, upstreamConfig, upstreamEndpoints } from "@/server/config";
import { ClientAbortError } from "@/server/infra/errors";

import { parseChangelogModels, type ChangelogModel } from "@/server/parsers/aa";
import { getAaIndexBody } from "@/server/sources/aa/index-source";
import { cached, requireRows } from "@/server/sources/pipeline";
import { errMsg } from "@/server/infra/task-pool";

const CHANGELOG_PATH = upstreamEndpoints.aaChangelog;

function newestFirst(models: ChangelogModel[]): ChangelogModel[] {
  return models.sort(byDateDesc((m) => m.releaseDate));
}

/**
 * The index page carries the same `models` array as /changelog, so read the body
 * the index source already caches instead of the 905 KB page. Best effort: a
 * missing body or markup drift must leave the page fetch as the working path.
 */
async function changelogFromIndexBody(ctx: AppContext): Promise<ChangelogModel[]> {
  try {
    return newestFirst(parseChangelogModels(await getAaIndexBody(ctx)));
  } catch (err) {
    if (err instanceof ClientAbortError) throw err;
    ctx.log("warn", `[artificial] changelog index-body read failed, falling back: ${errMsg(err)}`);
    return [];
  }
}

async function fetchChangelogPage(ctx: AppContext): Promise<string> {
  return ctx.http.text(
    `${upstreamConfig.artificialAnalysis}${CHANGELOG_PATH}`,
    {
      headers: { accept: "text/html,application/xhtml+xml,*/*" },
      ...UPSTREAM_FETCH_OPTS,
    },
    MAX_FEED_BYTES,
  );
}

async function fetchChangelogModels(ctx: AppContext): Promise<ChangelogModel[]> {
  const derived = await changelogFromIndexBody(ctx);
  if (derived.length > 0) {
    ctx.log("info", `[artificial] changelog derived from the cached index body (models=${derived.length})`);
    return derived;
  }
  const html = await fetchChangelogPage(ctx);
  const models = newestFirst(parseChangelogModels(html));
  requireRows(models, "AA changelog", "models", `raw=1 page, kept=0, markup changed?, body=${html.length}B`);
  return models;
}

export async function getChangelogModels(ctx: AppContext): Promise<ChangelogModel[]> {
  return cached(ctx, cacheKeys.changelog, STATIC_TTL_MS, async () => ({
    data: await fetchChangelogModels(ctx),
  }));
}
