import type { AppContext } from "@/server/context";
import { SOURCE_LIMITS, STATIC_TTL_MS } from "@/shared/config";
import { MAX_FEED_BYTES, UPSTREAM_FETCH_OPTS, cacheKeys, upstreamConfig, upstreamEndpoints } from "@/server/config";
import { zeroUpstream } from "@/server/infra/errors";
import { byDateDesc } from "@/server/parsers/shaping";
import type { ChangelogModel } from "@/server/parsers/aa-changelog";
import { parseChangelogModels } from "@/server/parsers/aa-changelog";

const CHANGELOG_PATH = upstreamEndpoints.aaChangelog;

async function fetchChangelogModels(ctx: AppContext): Promise<ChangelogModel[]> {
  const html = await ctx.http.text(
    `${upstreamConfig.artificialAnalysis}${CHANGELOG_PATH}`,
    {
      headers: { accept: "text/html,application/xhtml+xml,*/*" },
      ...UPSTREAM_FETCH_OPTS,
    },
    MAX_FEED_BYTES,
  );
  const models = parseChangelogModels(html);
  if (models.length === 0) {
    throw zeroUpstream("AA changelog", "models", `raw=1 page, kept=0, markup changed?, body=${html.length}B`);
  }
  // The embedded payload is a catalog snapshot, not date-ordered: sort newest
  // first so the cap keeps the recent window instead of an arbitrary head.
  return models.sort(byDateDesc((m) => m.releaseDate)).slice(0, SOURCE_LIMITS.changelog);
}

export async function getChangelogModels(ctx: AppContext): Promise<ChangelogModel[]> {
  return ctx.cache.withTtl(cacheKeys.changelog, STATIC_TTL_MS, async () => {
    return { data: await fetchChangelogModels(ctx) };
  });
}
