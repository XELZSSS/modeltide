import {
  isRecord,
  isoDate,
  numIntNonNegative,
  str,
  strOrNull,
  isSuitableNewsItem,
  isValidRowId,
} from "@/server/parsers/primitives";
import type { NewsItem, OpenSourceModelEntry } from "@/shared/types";
import { SOURCE_LIMITS } from "@/shared/config";
import { upstreamConfig } from "@/server/config";
import { zeroUpstreamMessage } from "@/server/infra/errors";
import { getOpenLicense } from "@/server/parsers/licenses";
import type { DailyPaperEntry, HFModel } from "@/server/parsers/upstream";
import { parseFail, parseOk, type ParseResult } from "@/server/parsers/result";

export function resolveAuthor(m: HFModel, id: string): string | null {
  return strOrNull(m.author) ?? (id.split("/")[0]?.trim() || null);
}

export function findUnknownLicenseTags(items: HFModel[], cap = 5): string[] {
  const unknown = new Set<string>();
  for (const m of items) {
    if (!Array.isArray(m.tags)) continue;
    for (const t of m.tags) {
      if (typeof t !== "string" || !t.toLowerCase().startsWith("license:")) continue;
      if (getOpenLicense([t]) == null) unknown.add(t);
      if (unknown.size >= cap) break;
    }
    if (unknown.size >= cap) break;
  }
  return [...unknown];
}

export function mapModel(m: HFModel): OpenSourceModelEntry | null {
  if (!isValidRowId(m.id)) return null;
  const id = (m.id as string).trim();
  const downloads = numIntNonNegative(m.downloads) ?? 0;
  const likes = numIntNonNegative(m.likes) ?? 0;
  const tags = Array.isArray(m.tags) ? m.tags.filter((t): t is string => typeof t === "string") : [];
  const license = getOpenLicense(tags);
  return {
    id,
    author: resolveAuthor(m, id),
    downloads,
    likes,
    license,
    task: strOrNull(m.pipeline_tag),
    createdAt: isoDate(m.createdAt),
    lastModified: isoDate(m.lastModified),
    tags,
  };
}

function toNewsItem(entry: DailyPaperEntry): NewsItem | null {
  const paper = isRecord(entry.paper) ? entry.paper : undefined;
  const id = str(paper?.id).trim();
  const title = str(paper?.title).replace(/\s+/g, " ").trim();
  const publishedAt = str(paper?.publishedAt);
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

export function parseDailyPapers(raw: unknown): ParseResult<NewsItem[]> {
  if (!Array.isArray(raw)) {
    return parseFail(`HuggingFace daily papers returned non-array (got ${raw === null ? "null" : typeof raw})`);
  }
  const items = (raw as DailyPaperEntry[])
    .map((entry) => ({ entry, upvotes: upvotesOf(entry) }))
    .sort((a, b) => b.upvotes - a.upvotes)
    .map(({ entry }) => toNewsItem(entry))
    .filter((x): x is NewsItem => x !== null);
  const seen = new Set<string>();
  const unique = items.filter((x) => (seen.has(x.id) ? false : (seen.add(x.id), true)));
  if (unique.length === 0) {
    return parseFail(zeroUpstreamMessage("HuggingFace daily papers", "usable items", `raw=${raw.length}`));
  }
  return parseOk(unique.slice(0, SOURCE_LIMITS.dailyPapers));
}

function upvotesOf(entry: DailyPaperEntry): number {
  const v = entry.paper?.upvotes;
  return typeof v === "number" && Number.isFinite(v) ? v : -1;
}
