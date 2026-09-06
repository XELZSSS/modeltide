import type { NewsItem } from "@/shared/types";
import { UPSTREAM_FETCH_OPTS, upstreamConfig } from "@/server/config";
import type { AppContext } from "@/server/context";
import { UpstreamError } from "@/server/infra/errors";
import { isRecord } from "@/server/parsers/primitives";
import { isSuitableNewsItem } from "@/server/sources/data-filter";

const MAX_PAPERS = 30;

interface DailyPaperEntry {
  paper?: {
    id?: unknown;
    title?: unknown;
    upvotes?: unknown;
    publishedAt?: unknown;
    summary?: unknown;
  };
}

function toNewsItem(entry: DailyPaperEntry): NewsItem | null {
  const paper = isRecord(entry.paper) ? entry.paper : undefined;
  const id = typeof paper?.id === "string" ? paper.id.trim() : "";
  const title = typeof paper?.title === "string" ? paper.title.replace(/\s+/g, " ").trim() : "";
  if (!id || !title) return null;
  const link = `${upstreamConfig.huggingfaceSite}/papers/${encodeURIComponent(id)}`;
  if (!isSuitableNewsItem(title, link)) return null;
  return {
    id: `hf-paper-${id}`,
    title,
    link,
    pubDate: typeof paper?.publishedAt === "string" ? paper.publishedAt : "1970-01-01T00:00:00Z",
    source: "Hugging Face Papers",
  };
}

export function parseDailyPapers(raw: unknown): NewsItem[] {
  if (!Array.isArray(raw)) {
    throw new UpstreamError(`HuggingFace daily papers returned non-array (got ${raw === null ? "null" : typeof raw})`);
  }
  const items = (raw as DailyPaperEntry[])
    .map((entry) => ({ entry, upvotes: upvotesOf(entry) }))
    .sort((a, b) => b.upvotes - a.upvotes)
    .map(({ entry }) => toNewsItem(entry))
    .filter((x): x is NewsItem => x !== null);
  const seen = new Set<string>();
  const unique = items.filter((x) => (seen.has(x.id) ? false : (seen.add(x.id), true)));
  if (unique.length === 0) {
    throw new UpstreamError(`HuggingFace daily papers yielded 0 usable items (raw=${raw.length})`);
  }
  return unique.slice(0, MAX_PAPERS);
}

function upvotesOf(entry: DailyPaperEntry): number {
  const v = entry.paper?.upvotes;
  return typeof v === "number" && Number.isFinite(v) ? v : -1;
}

export async function fetchDailyPapersItems(ctx: AppContext): Promise<NewsItem[]> {
  const url = `${upstreamConfig.huggingfaceSite}/api/daily_papers`;
  const raw = await ctx.http.json<unknown>(url, UPSTREAM_FETCH_OPTS);
  return parseDailyPapers(raw);
}
