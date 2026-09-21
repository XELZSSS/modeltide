import {
  isRecord,
  isoDate,
  numIntCoerceNonNegative,
  strOrNull,
  isSuitableNewsItem,
  isValidRowId,
  trimmedOrNull,
} from "@/server/parsers/parser-primitives";
import type { NewsItem, OpenSourceModelEntry } from "@/shared/types";
import { SOURCE_LIMITS } from "@/shared/config";
import { upstreamConfig } from "@/server/config";
import { zeroUpstreamMessage } from "@/server/infra/errors";
import { getOpenLicense } from "@/server/parsers/licenses";
import { dedupeBy } from "@/shared/utils";
import type { DailyPaperEntry, HFModel } from "@/server/parsers/upstream-types";
import { parseFail, parseOk, type ParseResult } from "@/server/parsers/parse-result";
import { stripHtml } from "@/server/parsers/html-to-text";
import { decodeEntities } from "@/server/parsers/html-entities";

function resolveAuthor(m: HFModel, id: string): string | null {
  return strOrNull(m.author) ?? (id.split("/")[0]?.trim() || null);
}

export function findUnknownLicenseTags(items: unknown[], cap = 5): string[] {
  const unknown = new Set<string>();
  for (const raw of items) {
    if (!isRecord(raw)) continue;
    const tags = (raw as HFModel).tags;
    if (!Array.isArray(tags)) continue;
    for (const t of tags) {
      if (typeof t !== "string" || !t.toLowerCase().startsWith("license:")) continue;
      if (getOpenLicense([t]) == null) unknown.add(t);
      if (unknown.size >= cap) break;
    }
    if (unknown.size >= cap) break;
  }
  return [...unknown];
}

export function mapModel(m: unknown): OpenSourceModelEntry | null {
  if (!isRecord(m)) return null;
  const model = m as HFModel;
  if (!isValidRowId(model.id)) return null;
  const id = (model.id as string).trim();
  const downloads = numIntCoerceNonNegative(model.downloads) ?? 0;
  const likes = numIntCoerceNonNegative(model.likes) ?? 0;
  const tags = Array.isArray(model.tags) ? model.tags.filter((t): t is string => typeof t === "string") : [];
  const license = getOpenLicense(tags);
  return {
    id,
    author: resolveAuthor(model, id),
    downloads,
    likes,
    license,
    task: strOrNull(model.pipeline_tag),
    createdAt: isoDate(model.createdAt),
    lastModified: isoDate(model.lastModified),
    tags: tags.slice(0, 100),
  };
}

function toNewsItem(entry: unknown): NewsItem | null {
  if (!isRecord(entry)) return null;
  const paper = isRecord((entry as DailyPaperEntry).paper) ? (entry as DailyPaperEntry).paper! : undefined;
  const rawId = trimmedOrNull(paper?.id);
  const rawTitle = typeof paper?.title === "string" ? paper.title : "";
  // Papers occasionally ship HTML-escaped titles; strip markup before gating.
  const title = stripHtml(decodeEntities(rawTitle)).replace(/\s+/g, " ").trim();
  const publishedAt = typeof paper?.publishedAt === "string" ? paper.publishedAt.trim() : "";
  if (!rawId || !title || !Number.isFinite(Date.parse(publishedAt))) return null;
  if (!isValidRowId(rawId)) return null;
  const link = `${upstreamConfig.huggingfaceSite}/papers/${encodeURIComponent(rawId)}`;
  if (!isSuitableNewsItem(title, link)) return null;
  return {
    id: `hf-paper-${rawId}`,
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
  const capped = raw.slice(0, 500);
  const items = capped
    .map((entry) => ({ entry, upvotes: upvotesOf(entry) }))
    .sort((a, b) => b.upvotes - a.upvotes)
    .map(({ entry }) => toNewsItem(entry))
    .filter((x): x is NewsItem => x !== null);
  const unique = dedupeBy(items, (x) => x.id);
  if (unique.length === 0) {
    return parseFail(zeroUpstreamMessage("HuggingFace daily papers", "usable items", `raw=${raw.length}`));
  }
  return parseOk(unique.slice(0, SOURCE_LIMITS.dailyPapers));
}

function upvotesOf(entry: unknown): number {
  if (!isRecord(entry)) return -1;
  const v = (entry as DailyPaperEntry).paper;
  const up = isRecord(v) ? (v as { upvotes?: unknown }).upvotes : (entry as { upvotes?: unknown }).upvotes;
  if (typeof up === "number" && Number.isFinite(up)) return up;
  if (typeof up === "string" && up.trim() !== "") {
    const n = Number(up.trim());
    if (Number.isFinite(n)) return n;
  }
  return -1;
}
