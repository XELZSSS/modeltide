import { byDateDesc } from "@/server/parsers/parser-primitives";
import type { AppContext } from "@/server/context";
import { STATIC_TTL_MS } from "@/shared/config";
import { MAX_FEED_BYTES, UPSTREAM_FETCH_OPTS, cacheKeys, upstreamConfig, upstreamEndpoints } from "@/server/config";
import { zeroUpstream } from "@/server/infra/errors";

import { parseChangelogModels, type ChangelogModel } from "@/server/parsers/aa";
import { cachedSource } from "@/server/sources/pipeline";

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
  return models.sort(byDateDesc((m) => m.releaseDate));
}

export async function getChangelogModels(ctx: AppContext): Promise<ChangelogModel[]> {
  return cachedSource(ctx, cacheKeys.changelog, STATIC_TTL_MS, async () => ({
    value: await fetchChangelogModels(ctx),
  }));
}
