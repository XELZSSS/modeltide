import type { NewsItem } from "@/shared/types";
import { SOURCE_LIMITS } from "@/shared/config";
import { UpstreamError, zeroUpstream } from "@/server/infra/errors";
import { isRecord, str } from "@/server/parsers/primitives";
import { isSuitableNewsItem } from "@/server/parsers/data-filter";
import { upstreamConfig } from "@/server/config";

export interface DailyPaperEntry {
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
  const id = str(paper?.id).trim();
  const title = str(paper?.title).replace(/\s+/g, " ").trim();
  const publishedAt = str(paper?.publishedAt);
  // No sentinel fallback: an undated paper would sink to the bottom of the
  // date-sorted research feed and render as a bogus ancient date in the UI.
  if (!id || !title || !Number.isFinite(Date.parse(publishedAt))) return null;
  const link = `${upstreamConfig.huggingfaceSite}/papers/${encodeURIComponent(id)}`;
  if (!isSuitableNewsItem(title, link)) return null;
  return {
    id: `hf-paper-${id}`,
    title,
    link,
    pubDate: publishedAt,
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
    throw zeroUpstream("HuggingFace daily papers", "usable items", `raw=${raw.length}`);
  }
  return unique.slice(0, SOURCE_LIMITS.dailyPapers);
}

function upvotesOf(entry: DailyPaperEntry): number {
  const v = entry.paper?.upvotes;
  return typeof v === "number" && Number.isFinite(v) ? v : -1;
}
