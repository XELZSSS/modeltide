import type { NewsItem } from "@/shared/types";
import { UPSTREAM_FETCH_OPTS, upstreamConfig, upstreamEndpoints } from "@/server/config";
import type { AppContext } from "@/server/context";
import { parseDailyPapers } from "@/server/parsers/hf-papers";

export async function fetchDailyPapersItems(ctx: AppContext): Promise<NewsItem[]> {
  const url = `${upstreamConfig.huggingfaceSite}${upstreamEndpoints.hfDailyPapers}`;
  const raw = await ctx.http.json<unknown>(url, UPSTREAM_FETCH_OPTS);
  return parseDailyPapers(raw);
}
